import assert from "assert";
import { dualAuthMiddleware } from "../server";

async function runTests() {
  console.log("🧪 Iniciando testes unitários do dualAuthMiddleware (Passo 2)...");

  // Configura variável mockada de token legado para os testes
  process.env.ACCESS_TOKEN = "test-legacy-token-123";

  // Teste 1: Requisição sem nenhum cabeçalho de autenticação -> Deve responder 401
  {
    let statusCode = 0;
    let jsonOutput: any = null;
    let nextCalled = false;

    const mockReq: any = {
      headers: {},
      ip: "127.0.0.1",
      originalUrl: "/api/db/users",
    };
    const mockRes: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) {
        jsonOutput = data;
        return this;
      },
    };
    const mockNext = () => { nextCalled = true; };

    await dualAuthMiddleware(mockReq, mockRes, mockNext);

    assert.strictEqual(statusCode, 401, "Teste 1 Falhou: Status deveria ser 401 para requisição sem auth");
    assert.strictEqual(nextCalled, false, "Teste 1 Falhou: next() não deveria ser chamado");
    console.log("  ✅ Teste 1 Passou: Requisição sem token negada com 401");
  }

  // Teste 2: Requisição com Token Legado Válido -> Deve chamar next() e autorizar
  {
    let nextCalled = false;
    let statusCode = 0;

    const mockReq: any = {
      headers: {
        "x-access-token": "test-legacy-token-123",
      },
      ip: "127.0.0.1",
      originalUrl: "/api/db/users",
    };
    const mockRes: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) { return this; },
    };
    const mockNext = () => { nextCalled = true; };

    await dualAuthMiddleware(mockReq, mockRes, mockNext);

    assert.strictEqual(nextCalled, true, "Teste 2 Falhou: Token legado válido deveria chamar next()");
    assert.strictEqual(statusCode, 0, "Teste 2 Falhou: Status não deveria ser 401");
    console.log("  ✅ Teste 2 Passou: Token legado autorizado via next()");
  }

  // Teste 3: Requisição com Bearer Token Inválido e sem token legado -> Deve responder 401
  {
    let statusCode = 0;
    let nextCalled = false;

    const mockReq: any = {
      headers: {
        authorization: "Bearer token_jwt_invalido_de_teste",
      },
      ip: "127.0.0.1",
      originalUrl: "/api/bitrix/add",
    };
    const mockRes: any = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(data: any) { return this; },
    };
    const mockNext = () => { nextCalled = true; };

    await dualAuthMiddleware(mockReq, mockRes, mockNext);

    assert.strictEqual(statusCode, 401, "Teste 3 Falhou: JWT inválido sem fallback deveria retornar 401");
    assert.strictEqual(nextCalled, false, "Teste 3 Falhou: next() não deveria ser chamado para JWT inválido");
    console.log("  ✅ Teste 3 Passou: JWT inválido rejeitado com 401");
  }

  console.log("🎉 Todos os testes do dualAuthMiddleware (Passo 2) passaram!");
}

runTests().catch((err) => {
  console.error("❌ Falha nos testes:", err);
  process.exit(1);
});
