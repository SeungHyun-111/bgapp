function connectionMessage(error, stage) {
  const code=error?.code;
  if(stage==='nlu') {
    if(code==='NLU_NOT_INSTALLED')return '아? 로컬 해석 엔진이나 학습 모델 파일이 없어. BI 연결 전 단계에서 멈췄어 🐰';
    if(code==='NLU_START_TIMEOUT')return '아? 로컬 엔진이 90초 안에 시작되지 않았어. BI 연결 전 단계에서 멈췄어 🐰';
    if(code==='NLU_PARSE_TIMEOUT')return '앗! 로컬 엔진의 질문 해석 응답 시간이 초과됐어. BI 연결 전 단계에서 멈췄어 🐰';
    return '앗! 로컬 해석 엔진에 연결하지 못했어. BI 연결 전 단계에서 멈췄어 🐰';
  }
  if(code==='BI_AUTH_REQUIRED'||code==='BI_AUTH_FAILED')return '아? 말뜻은 이해했는데 BI 인증에 실패했거나 로그인이 만료됐어. BI에 다시 로그인해줘 🐰';
  if(code==='BI_PERMISSION_DENIED')return '앗! 말뜻은 이해했는데 BI가 접근을 거부했어. 데이터셋 권한이나 회사 보안 정책을 확인해줘 🐰';
  if(code==='BI_QUERY_ERROR'||code==='QUERY_RESPONSE_ERROR')return '앗! 말뜻은 이해했는데 BI가 조회문을 처리하지 못했어. 조회식이나 지표 연결을 확인해야 해 🐰';
  if(code==='BI_TIMEOUT')return '우응… 말뜻은 이해했는데 BI 응답 대기 시간이 초과됐어. 로그인 문제인지는 확인되지 않았어 🐰';
  if(code==='BI_NETWORK_ERROR')return '앗! 말뜻은 이해했는데 BI 서비스에 연결하지 못했어. 네트워크 연결을 확인해줘 🐰';
  if(code==='MODULE_UNAVAILABLE')return '앗! 질문 해석은 끝났는데 BI 연결 모듈을 불러오지 못했어 🐰';
  return stage==='catalog'?'앗! 질문 해석은 끝났는데 BI 팀·상품 목록을 가져오지 못했어. 로그인 문제인지는 확인되지 않았어 🐰':'앗! 질문 해석은 끝났는데 BI 조회 단계에서 오류가 났어. 로그인 문제인지는 확인되지 않았어 🐰';
}
module.exports={connectionMessage};
