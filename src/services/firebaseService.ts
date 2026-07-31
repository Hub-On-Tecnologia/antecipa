import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithEmailAndPassword, setPersistence, inMemoryPersistence, onAuthStateChanged, User } from 'firebase/auth';
import { emailSinteticoDoCpf } from '../lib/identity';
import { getFirestore, setDoc, getDocs, collection, query, where, serverTimestamp, getDocFromServer, doc as firestoreDoc, updateDoc, addDoc, onSnapshot, orderBy, limit, deleteDoc, writeBatch } from 'firebase/firestore';
import { Receivable } from './sheetsService';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const firestoreDatabaseId = import.meta.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || '(default)';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firestoreDatabaseId);
export const auth = getAuth();
const googleProvider = new GoogleAuthProvider();
// Sem isto, o Google reaproveita silenciosamente a última conta usada no
// navegador — mesmo após signOut() no Firebase, que só encerra NOSSA sessão,
// não a sessão do próprio Google. Forçar o seletor de conta é o que permite
// trocar de usuário de fato.
googleProvider.setCustomParameters({ prompt: 'select_account' });

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export async function testConnection() {
  try {
    await getDocFromServer(firestoreDoc(db, 'test', 'connection'));
  } catch (error) {
    if(error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
  }
}

/**
 * Nenhuma sessão sobrevive ao fechamento nem à recarga da página: a senha é
 * pedida toda vez. Decisão de produto (2026-07-31), na mesma linha da remoção
 * da sessão de 8h — atrito é intencional aqui.
 *
 * `inMemoryPersistence` casa com o resto do desenho: o portão de acesso já
 * vive só na memória do React e exige token novo a cada carregamento. Guardar
 * a sessão do Firebase além disso não daria conveniência nenhuma, porque o
 * portão bloquearia a página antes.
 */
const persistenciaPronta = setPersistence(auth, inMemoryPersistence).catch((err) => {
  console.error('Falha ao configurar persistência de sessão:', err);
});

/**
 * Login por CPF e senha.
 *
 * O identificador da credencial no Firebase é derivado do CPF e montado AQUI,
 * no navegador. Não existe nenhuma consulta do tipo "qual o e-mail deste CPF?",
 * que seria um oráculo de enumeração da base de corretores.
 */
export async function signInWithCpfSenha(cpf: string, senha: string) {
  const identificador = emailSinteticoDoCpf(cpf);
  if (!identificador) {
    throw new Error('CPF inválido.');
  }
  // Sem esperar, uma sessão poderia ser gravada antes de a política valer.
  await persistenciaPronta;
  const result = await signInWithEmailAndPassword(auth, identificador, senha);
  return result.user;
}

export async function signInWithGoogle() {
  try {
    await persistenciaPronta;
    const result = await signInWithPopup(auth, googleProvider);
    return result.user;
  } catch (error) {
    console.error('Erro ao fazer login com Google:', error);
    throw error;
  }
}

/**
 * Helper para gerar o payload padrão de uma solicitação de comissão.
 * Centraliza a lógica de mapeamento dos campos da planilha para o Firestore.
 */
const getCommissionPayload = (
  receivable: Receivable, 
  userId: string, 
  isCollateral: boolean, 
  collateralFor: string | null, 
  bitrixDealId?: string | null,
  advanceType: 'TOTAL' | 'PARCIAL' = 'TOTAL',
  advanceAmount?: number
) => {
  const actualAdvanceAmount = advanceAmount !== undefined && advanceAmount > 0 
    ? Number(advanceAmount) 
    : Number(receivable.valorNumeric);

  const docSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
  const commissionId = `${receivable.id}-${receivable.previsaoMes}-${receivable.previsaoAno}_${docSuffix}`.replace(/[^\w-]/g, '_');

  const payload: any = {
    pvId: String(receivable.id),
    receivableId: commissionId,
    amount: Number(receivable.valorNumeric),
    advanceType: advanceType,
    advanceAmount: actualAdvanceAmount,
    previsaoMes: String(receivable.previsaoMes),
    previsaoAno: String(receivable.previsaoAno),
    userId: userId,
    status: 'pending',
    stageName: isCollateral ? 'Título em Garantia' : (advanceType === 'PARCIAL' ? 'Solicitação Parcial Encaminhada' : 'Solicitação Encaminhada'),
    isCollateral: Boolean(isCollateral),
    userRole: receivable.userRole || 'Corretor',
    requestedAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  };

  if (collateralFor) {
    payload.collateralFor = String(collateralFor);
  }

  if (bitrixDealId) {
    payload.bitrixDealId = String(bitrixDealId);
  }

  return { commissionId, payload };
};

/**
 * Salva uma solicitação de antecipação individual no Firestore.
 */
export async function savePromisedCommission(
  receivable: Receivable, 
  userId: string, 
  isCollateral: boolean = false, 
  collateralFor: string | null = null, 
  bitrixDealId?: string | null,
  advanceType: 'TOTAL' | 'PARCIAL' = 'TOTAL',
  advanceAmount?: number
) {
  const path = 'promised_commissions';
  try {
    const { commissionId, payload } = getCommissionPayload(receivable, userId, isCollateral, collateralFor, bitrixDealId, advanceType, advanceAmount);
    await setDoc(firestoreDoc(db, path, commissionId), payload);
    return commissionId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

/**
 * Salva múltiplas solicitações (principal + colaterais) em uma única transação atômica (Batch).
 */
export async function saveAdvancementWithCollateral(
  primary: Receivable, 
  collateralItems: Receivable[], 
  userId: string, 
  bitrixDealId?: string | null,
  advanceType: 'TOTAL' | 'PARCIAL' = 'TOTAL',
  advanceAmount?: number
) {
  const path = 'promised_commissions';
  const batch = writeBatch(db);
  
  // Adiciona o principal no batch
  const { commissionId: primaryId, payload: primaryPayload } = getCommissionPayload(primary, userId, false, null, bitrixDealId, advanceType, advanceAmount);
  const primaryRef = firestoreDoc(db, path, primaryId);
  batch.set(primaryRef, primaryPayload);
  
  // Adiciona colaterais no batch
  collateralItems.forEach(c => {
    const { commissionId: cId, payload: cPayload } = getCommissionPayload(c, userId, true, primaryId, bitrixDealId, 'TOTAL', c.valorNumeric);
    const cRef = firestoreDoc(db, path, cId);
    batch.set(cRef, cPayload);
  });

  try {
    await batch.commit();
    return primaryId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export async function fetchPromisedCommissions(userId: string) {
  const path = 'promised_commissions';
  try {
    const q = query(collection(db, path), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => doc.data());
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, path);
    return [];
  }
}

/**
 * Atualiza o status e informações de uma comissão no Firestore.
 * Notifica o usuário se houver mudança de status relevante.
 */
export async function updateCommissionStatus(commissionId: string, status: 'pending' | 'approved' | 'rejected', stageName: string) {
  const path = 'promised_commissions';
  try {
    const docRef = firestoreDoc(db, path, commissionId);
    
    // Buscar dados atuais para evitar notificações duplicadas e escritas desnecessárias
    const docSnap = await getDocFromServer(docRef);
    if (docSnap.exists()) {
      const currentData = docSnap.data();
      const oldStatus = currentData.status;
      const oldStage = currentData.stageName;

      // Só atualiza se algo mudou
      if (oldStatus !== status || oldStage !== stageName) {
        await updateDoc(docRef, { status, stageName, updatedAt: serverTimestamp() });

        // Gera notificação visual para o usuário
        if (oldStatus !== status) {
          let title = "Atualização de Solicitação";
          let message = `Sua solicitação para PV ${currentData.pvId} agora está: ${stageName}`;
          let type: 'info' | 'success' | 'error' | 'warning' = 'info';

          if (status === 'approved') {
            title = "Antecipação Aprovada";
            type = 'success';
          } else if (status === 'rejected') {
            title = "Solicitação Negada";
            type = 'error';
          }

          await addNotification(currentData.userId, title, message, type);
        }
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

/**
 * Remove múltiplas solicitações do Firestore em lote (Batch).
 * Útil para limpeza de registros que não existem mais no CRM.
 */
export async function deletePromisedCommissionsBulk(commissionIds: string[]) {
  if (commissionIds.length === 0) return;
  const path = 'promised_commissions';
  const batch = writeBatch(db);
  
  commissionIds.forEach(id => {
    const docRef = firestoreDoc(db, path, id);
    batch.delete(docRef);
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

/**
 * Atualiza múltiplos status do Firestore em lote (Batch).
 */
export async function updateCommissionsStatusBulk(updates: { id: string, status: 'pending' | 'approved' | 'rejected', stageName: string, bitrixDealId?: string }[]) {
  if (updates.length === 0) return;
  const path = 'promised_commissions';
  const batch = writeBatch(db);
  
  updates.forEach(u => {
    const docRef = firestoreDoc(db, path, u.id);
    const updatePayload: Record<string, any> = { 
      status: u.status, 
      stageName: u.stageName, 
      updatedAt: serverTimestamp() 
    };
    // Persiste o bitrixDealId se fornecido (link entre Firestore e Bitrix CRM)
    if (u.bitrixDealId) {
      updatePayload.bitrixDealId = u.bitrixDealId;
    }
    batch.update(docRef, updatePayload);
  });

  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deletePromisedCommission(commissionId: string) {
  const path = 'promised_commissions';
  try {
    const docRef = firestoreDoc(db, path, commissionId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function addNotification(userId: string, title: string, message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
  const path = 'notifications';
  try {
    const colRef = collection(db, path);
    await addDoc(colRef, {
      userId,
      title,
      message,
      type,
      read: false,
      createdAt: serverTimestamp()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

export function subscribeToNotifications(userId: string, onUpdate: (notifications: any[]) => void) {
  const path = 'notifications';
  const q = query(
    collection(db, path),
    where('userId', '==', userId),
    orderBy('createdAt', 'desc'),
    limit(20)
  );

  return onSnapshot(q, (snapshot) => {
    const notifications = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    onUpdate(notifications);
  }, (error) => {
    // Ignora erros de snapshot silentely se for permissão (comum no logout)
    console.warn('Snapshot error:', error);
  });
}

export async function markNotificationAsRead(notificationId: string) {
  const path = 'notifications';
  try {
    const docRef = firestoreDoc(db, path, notificationId);
    await updateDoc(docRef, { read: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function deleteNotification(notificationId: string) {
  const path = 'notifications';
  try {
    const docRef = firestoreDoc(db, path, notificationId);
    await deleteDoc(docRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
}

export async function saveSignature(commissionId: string, signature: { name: string; document: string; address: string; ip: string; userAgent: string; metadata?: any }) {
  const path = 'promised_commissions';
  try {
    const docRef = firestoreDoc(db, path, commissionId);
    await setDoc(docRef, { 
      signatureData: signature, 
      signedAt: serverTimestamp(),
      updatedAt: serverTimestamp() 
    }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
  }
}

export async function logAccess(userId: string, userEmail: string, userName: string, action: string) {
  const path = 'access_logs';
  try {
    const colRef = collection(db, path);
    await addDoc(colRef, {
      userId,
      userEmail,
      userName,
      action,
      timestamp: serverTimestamp()
    });
  } catch (error) {
    // Log silently errors on access logs to avoid interrupting user flow
    console.error('Audit Log Error:', error);
  }
}

export { onAuthStateChanged };
export type { User };
