#!/bin/bash
# Script de Instalação e Configuração Automática do antcp-hubon para VPS (Ubuntu/Debian)

set -e

DOMAIN=$1

if [ -z "$DOMAIN" ]; then
    echo "Erro: Forneça seu domínio como argumento."
    echo "Exemplo de uso: ./deploy-vps.sh meudominio.com"
    exit 1
fi

echo "========================================="
echo " Iniciando Deploy Automático: antcp-hubon"
echo " Domínio: $DOMAIN"
echo "========================================="

echo "[1/6] Atualizando pacotes do sistema..."
sudo apt update && sudo apt upgrade -y

echo "[2/6] Instalando dependências (Node.js 20, Nginx, Certbot, PM2)..."
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs git nginx certbot python3-certbot-nginx
sudo npm install -g pm2

echo "[3/6] Instalando dependências do projeto e realizando build..."
npm install
npm run build

echo "[4/6] Iniciando aplicação antcp-hubon no PM2..."
pm2 start ecosystem.config.cjs
pm2 save

echo "[5/6] Configurando Proxy Reverso no Nginx..."
sudo cat <<EOF > /etc/nginx/sites-available/antcp-hubon
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_cache_bypass \$http_upgrade;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF

sudo ln -sf /etc/nginx/sites-available/antcp-hubon /etc/nginx/sites-enabled/antcp-hubon
sudo nginx -t
sudo systemctl reload nginx

echo "[6/6] Gerando certificado SSL grátis (HTTPS)..."
sudo certbot --nginx -d $DOMAIN -d www.$DOMAIN --redirect --non-interactive --agree-tos -m admin@$DOMAIN || true

echo "========================================="
echo " SUCESSO! antcp-hubon implantado com sucesso!"
echo " Acesse: https://$DOMAIN"
echo "========================================="
