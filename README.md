<div align="center">

# 🟢 GruposWhats

### O Maior Diretório de Grupos de WhatsApp do Brasil

[![Site ao Vivo](https://img.shields.io/badge/🌐%20SITE%20AO%20VIVO-ACCESS%20NOW-25D366?style=for-the-badge)](https://mg5860606-ux.github.io/GRUPOWHATSS/)

### 🌐 **Site no ar:** [https://mg5860606-ux.github.io/GRUPOWHATSS/](https://mg5860606-ux.github.io/GRUPOWHATSS/)

[![GitHub Pages](https://img.shields.io/badge/GitHub%20Pages-222?style=flat&logo=githubpages&logoColor=white)](https://mg5860606-ux.github.io/GRUPOWHATSS/)
![GitHub repo size](https://img.shields.io/github/repo-size/mg5860606-ux/GRUPOWHATSS)
![GitHub last commit](https://img.shields.io/github/last-commit/mg5860606-ux/GRUPOWHATSS)
![GitHub stars](https://img.shields.io/github/stars/mg5860606-ux/GRUPOWHATSS)
![License](https://img.shields.io/github/license/mg5860606-ux/GRUPOWHATSS)
![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=flat&logo=html5&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-F7DF1E?style=flat&logo=javascript&logoColor=black)
![Firebase](https://img.shields.io/badge/Firebase-FFCA28?style=flat&logo=firebase&logoColor=black)

[**🌐 Acessar Site Ao Vivo**](https://mg5860606-ux.github.io/GRUPOWHATSS/) • [**Enviar Grupo**](https://mg5860606-ux.github.io/GRUPOWHATSS/send-group.html) • [**Meus Grupos**](https://mg5860606-ux.github.io/GRUPOWHATSS/user-groups.html) • [**Planos VIP**](https://mg5860606-ux.github.io/GRUPOWHATSS/vip.html)

---

</div>

## 📋 Sobre o Projeto

O **GruposWhats** é um diretório completo de links de grupos de WhatsApp, permitindo que usuários encontrem, enviem e gerenciem grupos de diversas categorias. O site conta com sistema VIP, painel administrativo completo, moderação automatizada e total otimização para SEO.

## ✨ Funcionalidades

### 🌐 Site Público
- **Catálogo de Grupos** — centenas de grupos organizados por categoria
- **Busca em Tempo Real** — filtro instantâneo por nome e descrição
- **Sistema VIP** — destaque dourado, animações exclusivas e prioridade
- **Impulso Grátis** — impulsionamento temporário sem custo
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
- **100% Responsivo** — funciona perfeitamente no celular

### 🔒 Segurança
- **Firestore Rules** — regras granulares por coleção
- **Aprovação Manual** — todos os grupos passam por moderação
- **Rate Limiting** — proteção contra spam e floods
- **Blacklist** — bloqueio de usuários por IP

## 🛠️ Tecnologias Utilizadas

| Tecnologia | Uso |
|---|---|
| **HTML5** | Estrutura do site |
| **CSS3** | Estilos, animações VIP, responsivo |
| **JavaScript** | Lógica, navegação SPA, Firestore |
| **Firebase Auth** | Autenticação anônima |
| **Cloud Firestore** | Banco de dados em tempo real |
| **GitHub Pages** | Hospedagem e deploy automático |

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

### Pré-requisitos
- [Git](https://git-scm.com/)
- Um navegador web atualizado

### Instalação

```bash
# Clone o repositório
git clone https://github.com/mg5860606-ux/GRUPOWHATSS.git

# Entre na pasta
cd GRUPOWHATSS

# Abra o index.html no navegador
# ou use um servidor local (recomendado):
```

### Servidor Local (recomendado)

```bash
# Com Node.js
npx serve .

# Com Python
python -m http.server 8000

# Com PHP
php -S localhost:8000
```

Acesse `http://localhost:3000` ou `http://localhost:8000`.

## 🔥 Firebase Setup

O projeto usa **Cloud Firestore** para armazenar dados. Para conectar ao seu próprio Firebase:

1. Acesse [Firebase Console](https://console.firebase.google.com/)
2. Crie um novo projeto
3. Ative **Authentication** → método: Anônimo
4. Crie um banco **Cloud Firestore**
5. Atualize as credenciais em `script.js`:

```javascript
const firebaseConfig = {
    apiKey: "SUA_API_KEY",
    authDomain: "seu-projeto.firebaseapp.com",
    projectId: "seu-projeto",
    storageBucket: "seu-projeto.appspot.com",
    messagingSenderId: "123456789",
    appId: "1:123456789:web:abc123"
};
```

6. Aplique as regras de `firestore.rules` no console

## 📊 SEO & Performance

- ✅ **Open Graph** — preview completo em WhatsApp, Facebook, LinkedIn
- ✅ **Twitter Cards** — preview em Twitter/X
- ✅ **JSON-LD** — Schema.org (WebSite, FAQPage, Organization, BreadcrumbList)
- ✅ **Meta Tags** — description, keywords, canonical, robots
- ✅ **Sitemap XML** — todas as 10 páginas indexadas
- ✅ **Skeleton Loading** — carregamento visual instantâneo
- ✅ **Lazy Loading** — imagens carregadas sob demanda
- ✅ **Mobile First** — 100% responsivo em todos os dispositivos

## 📱 Responsividade

| Dispositivo | Status |
|---|---|
| Desktop (1200px+) | ✅ Perfeito |
| Tablet (768px - 1199px) | ✅ Perfeito |
| Mobile (480px - 767px) | ✅ Perfeito |
| Mobile pequeno (<480px) | ✅ Perfeito |

## 📄 Páginas

| Página | Descrição |
|---|---|
| [index.html](https://mg5860606-ux.github.io/GRUPOWHATSS/) | Página principal com catálogo de grupos |
| [send-group.html](https://mg5860606-ux.github.io/GRUPOWHATSS/send-group.html) | Enviar novo grupo |
| [user-groups.html](https://mg5860606-ux.github.io/GRUPOWHATSS/user-groups.html) | Meus grupos enviados |
| [group-details.html](https://mg5860606-ux.github.io/GRUPOWHATSS/group-details.html) | Detalhes de um grupo |
| [vip.html](https://mg5860606-ux.github.io/GRUPOWHATSS/vip.html) | Planos VIP |
| [faq.html](https://mg5860606-ux.github.io/GRUPOWHATSS/faq.html) | Perguntas frequentes |
| [blog.html](https://mg5860606-ux.github.io/GRUPOWHATSS/blog.html) | Blog com dicas |
| [termos.html](https://mg5860606-ux.github.io/GRUPOWHATSS/termos.html) | Termos de uso |
| [privacidade.html](https://mg5860606-ux.github.io/GRUPOWHATSS/privacidade.html) | Política de privacidade |
| [admin.html](https://mg5860606-ux.github.io/GRUPOWHATSS/admin.html) | Painel administrativo |

## 🤝 Contribuir

1. Faça um fork do repositório
2. Crie uma branch (`git checkout -b feature/nova-funcionalidade`)
3. Faça commit (`git commit -m 'Adiciona nova funcionalidade'`)
4. Push para a branch (`git push origin feature/nova-funcionalidade`)
5. Abra um Pull Request

## 📄 Licença

Este projeto está sob a licença MIT. Veja o arquivo [LICENSE](LICENSE) para mais detalhes.

## 📞 Contato

**GruposWhats** — [mg5860606-ux.github.io/GRUPOWHATSS](https://mg5860606-ux.github.io/GRUPOWHATSS/)

---

<div align="center">

Feito com ❤️ para a comunidade de WhatsApp do Brasil

**[⬆ Voltar ao topo](#-gruposwhats)**

</div>
