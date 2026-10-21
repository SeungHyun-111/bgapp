// Do not write suspected credentials to either the learning log or BI requests.
function containsCredential(input) {
  return /(?:비밀\s*번호|패스워드|암호|로그인\s*(?:정보|아이디)|인증\s*(?:토큰|코드)|password|passwd|\bpwd\b|\bpw\b|bearer\s|authorization|(?:access|refresh)[ _-]?token|client[ _-]?secret|api[ _-]?key)/i.test(input)
    || /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.test(input)
    || /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(input)
    || /(?:^|\s)(?=\S*[a-z])(?=\S*[A-Z])(?=\S*\d)(?=\S*[^A-Za-z0-9가-힣])\S{8,}(?=\s|$)/.test(input)
    || /(?:^|\s)[A-Za-z0-9_-]{40,}(?=\s|$)/.test(input);
}
module.exports = { containsCredential };
