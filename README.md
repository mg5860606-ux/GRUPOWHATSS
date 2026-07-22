<div align="center">

# 🟢 GruposWhats

### O Maior Diretório de Grupos de WhatsApp do Brasil

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-222?style=flat&logo=githubpages&logoColor=white)](https://mg5860606-ux.github.io/GRUPOWHATSS/)
![GitHub repo size](https://img.shields.io/github/repo-size/mg5860606-ux/GRUPOWHATSS)
![GitHub last commit](https://img.shields.io/github/last-commit/mg5860606-ux/GRUPOWHATSS)
![GitHub stars](https://img.shields.io/github/stars/mg5860606-ux/GRUPOWHATSS)
![License](https://img.shields.io/github/license/mg5860606-ux/GRUPOWHATSS)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat&logo=firebase&logoColor=black)

[**Site ao vivo**](https://mg5860606-ux.github.io/GRUPOWHATSS/) • [**Enviar Grupo**](https://mg5860606-ux.github.io/GRUPOWHATSS/send-group.html) • [**Meus Grupos**](https://mg5860606-ux.github.io/GRUPOWHATSS/user-groups.html) • [**Planos VIP**](https://mg5860606-ux.github.io/GRUPOWHATSS/vip.html)

---

</div>

## 📋 Sobre o Projeto

O **GruposWhats** é um diretório completo de links de grupos de WhatsApp, permitindo que usuários encontrem, enviem e gerenciem grupos de diversas categorias. O site conta com sistema VIP, hospedagem de imagens via API ImgBB, painel administrativo completo, moderação automatizada e otimização SEO.

## ✨ Funcionalidades

### 🌐 Site Público
- **Catálogo de Grupos** — centenas de grupos organizados por categoria
- **Busca em Tempo Real** — filtro instantâneo por nome e descrição
- **Ordenação Dinâmica** — exibição aleatória de grupos a cada atualização da página (com VIPs e Impulsionados sempre no topo)
- **Sistema VIP** — destaque dourado, animações exclusivas e prioridade
- **Impulso Grátis** — impulsionamento temporário sem custo
- **Upload Leve de Imagens** — compressão em WebP + upload via ImgBB
- **Compartilhar** — botões nativos para WhatsApp, Facebook, Twitter e cópia
- **Relatar Erros** — sistema de denúncia de grupos com link quebrado
- **Meus Grupos** — gerencie todos os seus grupos enviados em um só lugar
- **Frases para Status** — seção com frases categorizadas para WhatsApp

### 📊 Painel Administrativo
- **Dashboard** — estatísticas em tempo real (grupos, pendentes, VIP, visitas)
- **Moderação** — aprovar/rejeitar em lote com busca e motivo de reprovação
- **Grupo do Dia** — destaque automático do grupo mais visitado
- **Blacklist** — banir usuários por IP com contagem e desbanimento
- **Ferramentas** — ranking top 15, exportar CSV, limpar links quebrados
- **Log de Atividades** — registro completo de todas as ações do admin
- **100% Responsivo** — funciona perfeitamente no celular e desktop

### 🔒 Segurança
- **Firestore Rules** — regras granulares por coleção
- **Aprovação Manual** — todos os grupos passam por moderação
- **Rate Limiting & Anti-Spam** — proteção contra spam e termos proibidos
- **Blacklist** — bloqueio de usuários por IP

## 🛠️ Tecnologias Utilizadas

| Tecnologia | Uso |
|---|---|
| **HTML5** | Estrutura do site |
| **CSS3** | Estilos, animações VIP, responsivo |
| **JavaScript (ES6+)** | Lógica, ordenação dinâmica, integração Firebase |
| **Firebase Auth & Firestore** | Autenticação anônima e banco de dados em tempo real |
| **ImgBB API** | Upload e hospedagem gratuita de imagens WebP |
| **GitHub Pages** | Hospedagem rápida do frontend |

## 📂 Estrutura do Projeto

```
GRUPOWHATSS/
├── index.html          # Página principal com catálogo
├── send-group.html     # Formulário de envio de grupo
├── user-groups.html    # Painel do usuário (meus grupos)
├── group-details.html  # Página de detalhes do grupo
├── vip.html            # Planos VIP
├── faq.html            # Perguntas frequentes
├── blog.html           # Blog com dicas
├── termos.html         # Termos de uso
├── privacidade.html    # Política de privacidade
├── admin.html          # Painel administrativo
├── script.js           # Lógica principal do site
├── styles.css          # Estilos globais e VIP
├── logo.svg            # Logo do site
├── firestore.rules     # Regras de segurança Firestore
├── sitemap.xml         # Sitemap para Google
└── social-preview.jpg  # Imagem de preview social
```

## 🚀 Como Executar Localmente

### Instalação

```bash
# Clone o repositório
git clone https://github.com/mg5860606-ux/GRUPOWHATSS.git

# Entre na pasta
cd GRUPOWHATSS
```

### Servidor Local (recomendado)

```bash
# Com Python
python -m http.server 8000

# Com Node.js
npx serve .
```

Acesse no seu navegador: `http://localhost:8000`

## 🤝 Contribuir

1. Faça um fork do repositório
2. Crie uma branch (`git checkout -b feature/nova-funcionalidade`)
3. Faça commit (`git commit -m 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

---

<div align="center">

Feito com ❤️ para a comunidade de WhatsApp do Brasil

**[⬆ Voltar ao topo](#-gruposwhats)**

</div>
