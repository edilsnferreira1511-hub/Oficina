/* COOPMETRO XPT — configuração do app web do Firebase (projeto "coopmetro-xpt").
 * Estes valores identificam o app web e NÃO são segredos (a proteção está nas regras do Firestore e na autenticação).
 * NÃO coloque aqui senhas, contas de serviço, chaves privadas ou tokens administrativos.
 *
 * AÇÃO NECESSÁRIA (feita por você): preencher "apiKey" com o valor que aparece em
 *   Console Firebase → Configurações do projeto → Seus apps → app web "Coopmetro" → "Configuração do SDK".
 * Enquanto "apiKey" estiver vazia o sistema abre em MODO DEMONSTRAÇÃO (dados fictícios em memória, sem login, sem rede).
 * Com "apiKey" preenchida o sistema exige login real e grava no Firestore, SOMENTE sob o caminho env/teste/. */
window.CXPT_FIREBASE = {
  config: {
    apiKey: '', // <- cole aqui (não foi informada; não inventamos valores)
    authDomain: 'coopmetro-xpt.firebaseapp.com',
    projectId: 'coopmetro-xpt',
    storageBucket: 'coopmetro-xpt.firebasestorage.app',
    messagingSenderId: '830962789514',
    appId: '1:830962789514:web:cdafd6639ac98bdd115173',
    measurementId: 'G-6Y4S4VVK68', // Analytics NÃO é carregado por este sistema
  },
  sdkVersion: '10.14.1',
};
