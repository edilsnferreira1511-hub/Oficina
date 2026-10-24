/* COOPMETRO XPT — configuração do app web do Firebase (projeto "coopmetro-xpt").
 * Estes valores identificam o app web e NÃO são segredos (a proteção está nas regras do Firestore e na autenticação).
 * NÃO coloque aqui senhas, contas de serviço, chaves privadas ou tokens administrativos.
 *
 * apiKey preenchida (veio do Console Firebase → Configurações do projeto → Seus apps → "Coopmetro" → Configuração do SDK).
 * Se "apiKey" ficar vazia o sistema abre em MODO DEMONSTRAÇÃO (dados fictícios em memória, sem login, sem rede).
 * Com "apiKey" preenchida o sistema exige login real e grava no Firestore, SOMENTE sob o caminho env/teste/. */
window.CXPT_FIREBASE = {
  config: {
    apiKey: 'AIzaSyDgoBTBCZbdIj7hi6-bCbvMtxW-k9weeqg', // informada pelo dono do projeto (Console → Configuração do SDK); identifica o app, não é segredo
    authDomain: 'coopmetro-xpt.firebaseapp.com',
    projectId: 'coopmetro-xpt',
    storageBucket: 'coopmetro-xpt.firebasestorage.app',
    messagingSenderId: '830962789514',
    appId: '1:830962789514:web:6d52394cc08f9a72115173',
    measurementId: 'G-CKXJZCV6R0', // Analytics NÃO é carregado por este sistema
  },
  sdkVersion: '10.14.1',
};
