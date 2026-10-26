// Deliberately fabricated rows, never copied from BI or presented as BI results.
function syntheticRows(){
  const rows=[];
  for(const year of [2025,2026])for(const month of [1,9,10]){
    for(const [brand,organization,type,minutes] of [['레이델','문화서비스','무형',10],['레이델','헬쓰푸드','유형',20],['다른브랜드','문화서비스','무형',30],['다른브랜드','헬쓰푸드','유형',40]]){
      rows.push({'BO[방송일시]':`${year}-${String(month).padStart(2,'0')}-21T20:00:00`,'BO[편성코드]':`[${brand}]합성테스트상품`,'BO[대표상품명]':'가짜 검증용 상품','BO[표준조직]':organization,'BO[유/무형]':type,'BO[가중분]':minutes,'BO[(전체)예상취급액]':minutes*10000,'BO[(전체)한계이익]':minutes*1000,'BO[(전체)총주문량]':minutes});
    }
  }
  return rows;
}
module.exports={syntheticRows};
