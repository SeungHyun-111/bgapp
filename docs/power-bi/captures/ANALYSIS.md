# BI 성능 기록 분석

기존 상품 검색 설정을 덮어쓰지 않는 별도 참조 카탈로그다.

- 원본 6개 / DAX 조회 42개 / 참조 항목 73개
- 기존 모델에 없던 측정값 참조 11개

## 원본과 조회식

| 파일 | 조회 수 | 주요 시각화 |
|---|---:|---|
| PowerBIPerformanceData (1).json | 5 | 가중분, 조직명 / (전체)취급달성률(%), (전체)매출달성률(%) 및 (전체)한계달성률(%), 조직명 / 가중분, 거래형태 / 테이블 |
| PowerBIPerformanceData (2).json | 11 | 카드 / Simple Image / 테이블 / 행렬 |
| PowerBIPerformanceData (3).json | 4 | (전체)무이자수수료, (전체)배송보관비, (전체)사은품, (전체)양품화비, (전체)적립금, (전체)제휴수수료, (전체)주문상담비, (전체)청구할인, (전체)PG수수료 및 (전체)제휴포인트 / 테이블 |
| PowerBIPerformanceData (4).json | 6 | 슬라이서 / 행렬 / 테이블 |
| PowerBIPerformanceData (5).json | 5 | 슬라이서 / 테이블 / 행렬 |
| PowerBIPerformanceData.json | 11 | 슬라이서 / 여러 행 카드 / 카드 / Simple Image / 테이블 |

## 계산식과 출처

기록에 등장한 실제 식을 아래에 보관한다. 측정값 참조만 있는 경우 모델 내부 식은 알 수 없으므로 새로 추측하지 않는다.

### capture-1-1: 가중분, 조직명

원본: PowerBIPerformanceData (1).json / DAX: docs/power-bi/captures/queries/capture-1-1.dax

기록 필터: {"treatAs":[{"kind":"TREATAS","values":"{2026}","fields":["'BO'[YEAR(DAX)]"]},{"kind":"TREATAS","values":"{9}","fields":["'BO'[MONTH(DAX)]"]}],"dateLiterals":[],"hasAllSelected":false}

- Sum가중분:
```dax
CALCULATE(SUM('BO'[가중분]))
```

### capture-1-2: (전체)취급달성률(%), (전체)매출달성률(%) 및 (전체)한계달성률(%), 조직명

원본: PowerBIPerformanceData (1).json / DAX: docs/power-bi/captures/queries/capture-1-2.dax

기록 필터: {"treatAs":[{"kind":"TREATAS","values":"{2026}","fields":["'BO'[YEAR(DAX)]"]},{"kind":"TREATAS","values":"{9}","fields":["'BO'[MONTH(DAX)]"]}],"dateLiterals":[],"hasAllSelected":false}

- v_전체_한계달성률___:
```dax
'BO'[(전체)한계달성률(%)]
```
- v_전체_취급달성률___:
```dax
'BO'[(전체)취급달성률(%)]
```
- v_전체_매출달성률___:
```dax
'BO'[(전체)매출달성률(%)]
```

### capture-1-3: 가중분, 거래형태

원본: PowerBIPerformanceData (1).json / DAX: docs/power-bi/captures/queries/capture-1-3.dax

기록 필터: {"treatAs":[{"kind":"TREATAS","values":"{2026}","fields":["'BO'[YEAR(DAX)]"]},{"kind":"TREATAS","values":"{9}","fields":["'BO'[MONTH(DAX)]"]}],"dateLiterals":[],"hasAllSelected":false}

- Sum가중분:
```dax
CALCULATE(SUM('BO'[가중분]))
```

### capture-1-4: 테이블

원본: PowerBIPerformanceData (1).json / DAX: docs/power-bi/captures/queries/capture-1-4.dax

기록 필터: {"treatAs":[{"kind":"TREATAS","values":"{2026}","fields":["'BO'[YEAR(DAX)]"]},{"kind":"TREATAS","values":"{9}","fields":["'BO'[MONTH(DAX)]"]}],"dateLiterals":[],"hasAllSelected":false}

- v_전체_한계_분_:
```dax
'BO'[(전체)한계(분)]
```
- v_전체_취급_분_:
```dax
'BO'[(전체)취급(분)]
```
- v_전체_예상매출액_V___분_:
```dax
'BO'[(전체)예상매출액(V-)(분)]
```
- v_전체_취급달성률___:
```dax
'BO'[(전체)취급달성률(%)]
```
- v_전체_매출달성률___:
```dax
'BO'[(전체)매출달성률(%)]
```
- v_전체_한계달성률___:
```dax
'BO'[(전체)한계달성률(%)]
```
- v_전체_미리주문_취급_목표___:
```dax
'BO'[(전체/미리주문)취급/목표(%)]
```
- Sumv_전체_예상취급액:
```dax
CALCULATE(SUM('BO'[(전체)예상취급액]))
```
- Sumv_전체_예상매출액_V__:
```dax
CALCULATE(
				SUM('BO'[(전체)예상매출액(V-)])
			)
```
- Sumv_전체_한계이익:
```dax
CALCULATE(SUM('BO'[(전체)한계이익]))
```

### capture-1-5: 테이블

원본: PowerBIPerformanceData (1).json / DAX: docs/power-bi/captures/queries/capture-1-5.dax

기록 필터: {"treatAs":[{"kind":"TREATAS","values":"{2026}","fields":["'BO'[YEAR(DAX)]"]},{"kind":"TREATAS","values":"{9}","fields":["'BO'[MONTH(DAX)]"]}],"dateLiterals":[],"hasAllSelected":false}

- v_전체_미리주문_취급_목표___:
```dax
'BO'[(전체/미리주문)취급/목표(%)]
```
- v_전체_한계_분_:
```dax
'BO'[(전체)한계(분)]
```
- v_전체_취급_분_:
```dax
'BO'[(전체)취급(분)]
```
- v_전체_취급달성률___:
```dax
'BO'[(전체)취급달성률(%)]
```
- v_전체_매출달성률___:
```dax
'BO'[(전체)매출달성률(%)]
```
- v_전체_한계달성률___:
```dax
'BO'[(전체)한계달성률(%)]
```
- Sumv_전체_예상매출총이익액_V__배송료_제외:
```dax
CALCULATE(
				SUM('BO'[(전체)예상매출총이익액(V-)배송료 제외])
			)
```

### capture-2-1: 카드

원본: PowerBIPerformanceData (2).json / DAX: docs/power-bi/captures/queries/capture-2-1.dax

기록 필터: {"treatAs":[{"kind":"TREATAS","values":"{\"[알렌오](26FW)체크셔켓\"}","fields":["'BO'[편성코드]"]}],"dateLiterals":[],"hasAllSelected":false}

- Sumv_전체_미리주문_예상취급액_V__:
```dax
IGNORE(
			CALCULATE(
				SUM('BO'[(전체/미리주문)예상취급액(V-)])
			)
		)
```

### capture-2-2: 카드

원본: PowerBIPerformanceData (2).json / DAX: docs/power-bi/captures/queries/capture-2-2.dax

기록 필터: {"treatAs":[{"kind":"TREATAS","values":"{\"[알렌오](26FW)체크셔켓\"}","fields":["'BO'[편성코드]"]}],"dateLiterals":[],"hasAllSelected":false}

- v_전체_한계이익에서__전체_방송중_한계이익을_를__뺀_값:
```dax
IGNORE(
			'BO'[(전체)한계이익에서 (전체/방송중)한계이익을(를) 뺀 값]
		)
```

### capture-2-3: 카드

원본: PowerBIPerformanceData (2).json / DAX: docs/power-bi/captures/queries/capture-2-3.dax

기록 필터: {"treatAs":[{"kind":"TREATAS","values":"{\"[알렌오](26FW)체크셔켓\"}","fields":["'BO'[편성코드]"]}],"dateLiterals":[],"hasAllSelected":false}

- v_전체_미리주문_한익률___:
```dax
IGNORE('BO'[(전체/미리주문)한익률(%)])
```

### capture-2-4: 카드

원본: PowerBIPerformanceData (2).json / DAX: docs/power-bi/captures/queries/capture-2-4.dax

기록 필터: {"treatAs":[{"kind":"TREATAS","values":"{\"[알렌오](26FW)체크셔켓\"}","fields":["'BO'[편성코드]"]}],"dateLiterals":[],"hasAllSelected":false}

- v_전체_한계_분_:
```dax
IGNORE('BO'[(전체)한계(분)])
```

### capture-2-5: 카드

원본: PowerBIPerformanceData (2).json / DAX: docs/power-bi/captures/queries/capture-2-5.dax

기록 필터: {"treatAs":[{"kind":"TREATAS","values":"{\"[알렌오](26FW)체크셔켓\"}","fields":["'BO'[편성코드]"]}],"dateLiterals":[],"hasAllSelected":false}

- v_전체_방송중_한계이익에서_정액수수료_원_을_를__뺀_값을_를___전체_방송중_예상취급액_V__에서_정액수수료_원_을_를__뺀_값_으_로_나눈_값:
```dax
IGNORE(
			'BO'[(전체/방송중)한계이익에서 정액수수료(원)을(를) 뺀 값을(를) (전체/방송중)예상취급액(V-)에서 정액수수료(원)을(를) 뺀 값(으)로 나눈 값]
		)
```

### capture-2-6: 카드

원본: PowerBIPerformanceData (2).json / DAX: docs/power-bi/captures/queries/capture-2-6.dax

기록 필터: {"treatAs":[{"kind":"TREATAS","values":"{\"[알렌오](26FW)체크셔켓\"}","fields":["'BO'[편성코드]"]}],"dateLiterals":[],"hasAllSelected":false}

- v_전체_방송중_변동비_V__을_를___전체_방송중_예상취급액_V__에서_정액수수료_원_을_를__뺀_값_으_로_나눈_값:
```dax
IGNORE(
			'BO'[(전체/방송중)변동비(V-)을(를) (전체/방송중)예상취급액(V-)에서 정액수수료(원)을(를) 뺀 값(으)로 나눈 값]
		)
```

### capture-2-7: Simple Image

원본: PowerBIPerformanceData (2).json / DAX: docs/power-bi/captures/queries/capture-2-7.dax

기록 필터: {"treatAs":[{"kind":"TREATAS","values":"{\"[알렌오](26FW)체크셔켓\"}","fields":["'BO'[편성코드]"]}],"dateLiterals":[],"hasAllSelected":false}


### capture-2-8: 테이블

원본: PowerBIPerformanceData (2).json / DAX: docs/power-bi/captures/queries/capture-2-8.dax

기록 필터: {"treatAs":[{"kind":"TREATAS","values":"{\"[알렌오](26FW)체크셔켓\"}","fields":["'BO'[편성코드]"]}],"dateLiterals":[],"hasAllSelected":false}

- v_연동_방송중_예상취급___:
```dax
'BO'[(연동/방송중)예상취급(%)]
```
- v_전체_방송중_한계달성률___:
```dax
'BO'[(전체/방송중)한계달성률(%)]
```

### capture-2-9: 행렬

원본: PowerBIPerformanceData (2).json / DAX: docs/power-bi/captures/queries/capture-2-9.dax

기록 필터: {"treatAs":[{"kind":"TREATAS","values":"{\"[알렌오](26FW)체크셔켓\"}","fields":["'BO'[편성코드]"]}],"dateLiterals":[],"hasAllSelected":false}

- v_연동_방송중_예상취급___:
```dax
'BO'[(연동/방송중)예상취급(%)]
```

### capture-2-10: 테이블

원본: PowerBIPerformanceData (2).json / DAX: docs/power-bi/captures/queries/capture-2-10.dax

기록 필터: {"treatAs":[{"kind":"TREATAS","values":"{\"[알렌오](26FW)체크셔켓\"}","fields":["'BO'[편성코드]"]}],"dateLiterals":[],"hasAllSelected":false}

- v_전체_방송중_한계달성률___:
```dax
'BO'[(전체/방송중)한계달성률(%)]
```
- v_연동_방송중_예상취급___:
```dax
'BO'[(연동/방송중)예상취급(%)]
```

### capture-2-11: 테이블

원본: PowerBIPerformanceData (2).json / DAX: docs/power-bi/captures/queries/capture-2-11.dax

기록 필터: {"treatAs":[{"kind":"TREATAS","values":"{\"[알렌오](26FW)체크셔켓\"}","fields":["'BO'[편성코드]"]}],"dateLiterals":[],"hasAllSelected":false}

- Sumv_전체_방송중_제휴포인트:
```dax
CALCULATE(SUM('BO'[(전체/방송중)제휴포인트]))
```
- Sum노출분:
```dax
CALCULATE(SUM('BO'[노출분]))
```
- Sum가중분:
```dax
CALCULATE(SUM('BO'[가중분]))
```
- v_전체_한계_분_:
```dax
'BO'[(전체)한계(분)]
```
- Sumv_연동_총주문량:
```dax
CALCULATE(SUM('BO'[(연동)총주문량]))
```
- 분당혼합비:
```dax
'BO'[분당혼합비]
```
- Sumv_전체_미리주문_예상취급액:
```dax
CALCULATE(SUM('BO'[(전체/미리주문)예상취급액]))
```
- v_전체_취급달성률___:
```dax
'BO'[(전체)취급달성률(%)]
```
- v_전체_매출달성률___:
```dax
'BO'[(전체)매출달성률(%)]
```
- v_전체_매총달성률___:
```dax
'BO'[(전체)매총달성률(%)]
```
- v_전체_한계달성률___:
```dax
'BO'[(전체)한계달성률(%)]
```
- v_전체_미리주문_취급_목표___:
```dax
'BO'[(전체/미리주문)취급/목표(%)]
```
- Sum판매가_대표상품_:
```dax
CALCULATE(SUM('BO'[판매가(대표상품)]))
```

### capture-3-1: (전체)무이자수수료, (전체)배송보관비, (전체)사은품, (전체)양품화비, (전체)적립금, (전체)제휴수수료, (전체)주문상담비, (전체)청구할인, (전체)PG수수료 및 (전체)제휴포인트

원본: PowerBIPerformanceData (3).json / DAX: docs/power-bi/captures/queries/capture-3-1.dax

기록 필터: {"treatAs":[],"dateLiterals":[],"hasAllSelected":false}

- Sumv_전체_무이자수수료:
```dax
CALCULATE(SUM('BO'[(전체)무이자수수료]))
```
- Sumv_전체_배송보관비:
```dax
CALCULATE(SUM('BO'[(전체)배송보관비]))
```
- Sumv_전체_사은품:
```dax
CALCULATE(SUM('BO'[(전체)사은품]))
```
- Sumv_전체_양품화비:
```dax
CALCULATE(SUM('BO'[(전체)양품화비]))
```
- Sumv_전체_적립금:
```dax
CALCULATE(SUM('BO'[(전체)적립금]))
```
- Sumv_전체_제휴수수료:
```dax
CALCULATE(SUM('BO'[(전체)제휴수수료]))
```
- Sumv_전체_주문상담비:
```dax
CALCULATE(SUM('BO'[(전체)주문상담비]))
```
- Sumv_전체_청구할인:
```dax
CALCULATE(SUM('BO'[(전체)청구할인]))
```
- Sumv_전체_PG수수료:
```dax
CALCULATE(SUM('BO'[(전체)PG수수료]))
```
- Sumv_전체_제휴포인트:
```dax
CALCULATE(SUM('BO'[(전체)제휴포인트]))
```

### capture-3-2: 테이블

원본: PowerBIPerformanceData (3).json / DAX: docs/power-bi/captures/queries/capture-3-2.dax

기록 필터: {"treatAs":[],"dateLiterals":[],"hasAllSelected":false}

- Sum노출분:
```dax
CALCULATE(SUM('BO'[노출분]))
```
- Sum가중분:
```dax
CALCULATE(SUM('BO'[가중분]))
```
- Sum판매가_대표상품_:
```dax
CALCULATE(SUM('BO'[판매가(대표상품)]))
```
- v_연동_방송중_정액外취급_분_:
```dax
'BO'[(연동/방송중)정액外취급(분)]
```
- v_전체_한계_분_:
```dax
'BO'[(전체)한계(분)]
```
- v_전체_취급달성률___:
```dax
'BO'[(전체)취급달성률(%)]
```
- v_전체_매출달성률___:
```dax
'BO'[(전체)매출달성률(%)]
```
- v_전체_매총달성률___:
```dax
'BO'[(전체)매총달성률(%)]
```
- v_전체_한계달성률___:
```dax
'BO'[(전체)한계달성률(%)]
```
- v_전체_미리주문_취급_목표___:
```dax
'BO'[(전체/미리주문)취급/목표(%)]
```

### capture-3-3: 테이블

원본: PowerBIPerformanceData (3).json / DAX: docs/power-bi/captures/queries/capture-3-3.dax

기록 필터: {"treatAs":[],"dateLiterals":[],"hasAllSelected":false}

- v_전체_예상매출총이익액_V___분_:
```dax
'BO'[(전체)예상매출총이익액(V-)(분)]
```
- v_연동_방송중_매출총이익액_V___분_:
```dax
'BO'[(연동/방송중)매출총이익액(V-)(분)]
```
- v_전체_한계_분_:
```dax
'BO'[(전체)한계(분)]
```
- v_전체_방송중_한계_분_:
```dax
'BO'[(전체/방송중)한계(분)]
```

### capture-3-4: 테이블

원본: PowerBIPerformanceData (3).json / DAX: docs/power-bi/captures/queries/capture-3-4.dax

기록 필터: {"treatAs":[],"dateLiterals":[],"hasAllSelected":false}

- v_전체_취급_분_:
```dax
'BO'[(전체)취급(분)]
```
- v_연동_방송중_취급액_분_:
```dax
'BO'[(연동/방송중)취급액(분)]
```
- v_연동_방송중_정액外취급_분_:
```dax
'BO'[(연동/방송중)정액外취급(분)]
```
- v_전체_예상매출액_V___분_:
```dax
'BO'[(전체)예상매출액(V-)(분)]
```

### capture-4-1: 슬라이서

원본: PowerBIPerformanceData (4).json / DAX: docs/power-bi/captures/queries/capture-4-1.dax

기록 필터: {"treatAs":[],"dateLiterals":[],"hasAllSelected":false}

- Min방송일시:
```dax
CALCULATE(MIN('BO'[방송일시]))
```
- Max방송일시:
```dax
CALCULATE(MAX('BO'[방송일시]))
```

### capture-4-2: 행렬

원본: PowerBIPerformanceData (4).json / DAX: docs/power-bi/captures/queries/capture-4-2.dax

기록 필터: {"treatAs":[{"kind":"TREATAS","values":"{\"유형\"}","fields":["'BO'[유/무형]"]}],"dateLiterals":["2025-11-01","2026-01-01"],"hasAllSelected":false}

- v_연동_방송중_예상취급___:
```dax
'BO'[(연동/방송중)예상취급(%)]
```

### capture-4-3: 테이블

원본: PowerBIPerformanceData (4).json / DAX: docs/power-bi/captures/queries/capture-4-3.dax

기록 필터: {"treatAs":[{"kind":"TREATAS","values":"{\"유형\"}","fields":["'BO'[유/무형]"]}],"dateLiterals":["2025-11-01","2026-01-01"],"hasAllSelected":true}

- DistinctCount방송일시:
```dax
CALCULATE(DISTINCTCOUNT('BO'[방송일시]))
```
- A1 [문맥 의존]:
```dax
CALCULATE(
				DIVIDE(DISTINCTCOUNT('BO'[방송일시]), CALCULATE(
					DISTINCTCOUNT('BO'[방송일시]),
					ALLSELECTED('BO'[조직명]),
					ALLSELECTED('BO'[MD분류]),
					ALLSELECTED('BO'[편성코드])
				))
			)
```
- v_연동_방송중_정액外취급_분_:
```dax
'BO'[(연동/방송중)정액外취급(분)]
```
- v_전체_취급_분_:
```dax
'BO'[(전체)취급(분)]
```
- v_전체_한계_분_:
```dax
'BO'[(전체)한계(분)]
```
- Sum가중분:
```dax
CALCULATE(SUM('BO'[가중분]))
```

### capture-4-4: 테이블

원본: PowerBIPerformanceData (4).json / DAX: docs/power-bi/captures/queries/capture-4-4.dax

기록 필터: {"treatAs":[{"kind":"TREATAS","values":"{\"유형\"}","fields":["'BO'[유/무형]"]}],"dateLiterals":["2025-11-01","2026-01-01"],"hasAllSelected":true}

- v_전체_취급_분_:
```dax
'BO'[(전체)취급(분)]
```
- A1 [문맥 의존]:
```dax
CALCULATE(
				DIVIDE(SUM('BO'[가중분]), CALCULATE(SUM('BO'[가중분]), ALLSELECTED('BO'[조직명])))
			)
```

### capture-4-5: 행렬

원본: PowerBIPerformanceData (4).json / DAX: docs/power-bi/captures/queries/capture-4-5.dax

기록 필터: {"treatAs":[{"kind":"TREATAS","values":"{\"유형\"}","fields":["'BO'[유/무형]"]}],"dateLiterals":["2025-11-01","2026-01-01"],"hasAllSelected":false}

- v_연동_방송중_정액外취급_분_:
```dax
'BO'[(연동/방송중)정액外취급(분)]
```

### capture-4-6: 행렬

원본: PowerBIPerformanceData (4).json / DAX: docs/power-bi/captures/queries/capture-4-6.dax

기록 필터: {"treatAs":[{"kind":"TREATAS","values":"{\"유형\"}","fields":["'BO'[유/무형]"]}],"dateLiterals":["2025-11-01","2026-01-01"],"hasAllSelected":false}

- v_연동_방송중_예상취급___:
```dax
'BO'[(연동/방송중)예상취급(%)]
```

### capture-5-1: 슬라이서

원본: PowerBIPerformanceData (5).json / DAX: docs/power-bi/captures/queries/capture-5-1.dax

기록 필터: {"treatAs":[],"dateLiterals":[],"hasAllSelected":false}

- Min방송일시:
```dax
CALCULATE(MIN('BO'[방송일시]))
```
- Max방송일시:
```dax
CALCULATE(MAX('BO'[방송일시]))
```

### capture-5-2: 테이블

원본: PowerBIPerformanceData (5).json / DAX: docs/power-bi/captures/queries/capture-5-2.dax

기록 필터: {"treatAs":[{"kind":"TREATAS","values":"{\"유형\"}","fields":["'BO'[유/무형]"]}],"dateLiterals":["2026-04-01","2026-05-12"],"hasAllSelected":true}

- DistinctCount방송일시:
```dax
CALCULATE(DISTINCTCOUNT('BO'[방송일시]))
```
- A1 [문맥 의존]:
```dax
CALCULATE(
				DIVIDE(DISTINCTCOUNT('BO'[방송일시]), CALCULATE(
					DISTINCTCOUNT('BO'[방송일시]),
					ALLSELECTED('BO'[조직명]),
					ALLSELECTED('BO'[MD분류]),
					ALLSELECTED('BO'[편성코드])
				))
			)
```
- v_전체_방송중_한계_분_:
```dax
'BO'[(전체/방송중)한계(분)]
```
- v_전체_한계_분_:
```dax
'BO'[(전체)한계(분)]
```
- Sum가중분:
```dax
CALCULATE(SUM('BO'[가중분]))
```

### capture-5-3: 행렬

원본: PowerBIPerformanceData (5).json / DAX: docs/power-bi/captures/queries/capture-5-3.dax

기록 필터: {"treatAs":[{"kind":"TREATAS","values":"{\"유형\"}","fields":["'BO'[유/무형]"]}],"dateLiterals":["2026-04-01","2026-05-12"],"hasAllSelected":false}

- v_연동_방송중_예상취급___:
```dax
'BO'[(연동/방송중)예상취급(%)]
```

### capture-5-4: 행렬

원본: PowerBIPerformanceData (5).json / DAX: docs/power-bi/captures/queries/capture-5-4.dax

기록 필터: {"treatAs":[{"kind":"TREATAS","values":"{\"유형\"}","fields":["'BO'[유/무형]"]}],"dateLiterals":["2026-04-01","2026-05-12"],"hasAllSelected":false}

- v_전체_방송중_한계_분_:
```dax
'BO'[(전체/방송중)한계(분)]
```

### capture-5-5: 행렬

원본: PowerBIPerformanceData (5).json / DAX: docs/power-bi/captures/queries/capture-5-5.dax

기록 필터: {"treatAs":[{"kind":"TREATAS","values":"{\"유형\"}","fields":["'BO'[유/무형]"]}],"dateLiterals":["2026-04-01","2026-05-12"],"hasAllSelected":false}

- v_전체_방송중_한계달성률___:
```dax
'BO'[(전체/방송중)한계달성률(%)]
```

### capture-6-1: 슬라이서

원본: PowerBIPerformanceData.json / DAX: docs/power-bi/captures/queries/capture-6-1.dax

기록 필터: {"treatAs":[],"dateLiterals":[],"hasAllSelected":false}

- Min방송일시:
```dax
CALCULATE(MIN('BO'[방송일시]))
```
- Max방송일시:
```dax
CALCULATE(MAX('BO'[방송일시]))
```

### capture-6-2: 여러 행 카드

원본: PowerBIPerformanceData.json / DAX: docs/power-bi/captures/queries/capture-6-2.dax

기록 필터: {"treatAs":[],"dateLiterals":["2026-10-21","2026-10-22"],"hasAllSelected":false}

- v_전체_취급_분_:
```dax
IGNORE('BO'[(전체)취급(분)])
```
- v_전체_예상매출액_V___분_:
```dax
IGNORE(
			'BO'[(전체)예상매출액(V-)(분)]
		)
```
- v_전체_예상매출총이익액_V___분_:
```dax
IGNORE(
			'BO'[(전체)예상매출총이익액(V-)(분)]
		)
```
- v_전체_한계_분_:
```dax
IGNORE('BO'[(전체)한계(분)])
```
- v_연동_방송중_정액外_취급액을_를__노출분_으_로_나눈_값:
```dax
IGNORE(
			'BO'[(연동/방송중)정액外 취급액을(를) 노출분(으)로 나눈 값]
		)
```

### capture-6-3: 카드

원본: PowerBIPerformanceData.json / DAX: docs/power-bi/captures/queries/capture-6-3.dax

기록 필터: {"treatAs":[],"dateLiterals":["2026-10-21","2026-10-22"],"hasAllSelected":false}

- v_전체_미리주문_한익률___:
```dax
IGNORE('BO'[(전체/미리주문)한익률(%)])
```

### capture-6-4: 카드

원본: PowerBIPerformanceData.json / DAX: docs/power-bi/captures/queries/capture-6-4.dax

기록 필터: {"treatAs":[],"dateLiterals":["2026-10-21","2026-10-22"],"hasAllSelected":false}

- v_전체_방송중_한계이익에서_정액수수료_원_을_를__뺀_값을_를___전체_방송중_예상취급액_V__에서_정액수수료_원_을_를__뺀_값_으_로_나눈_값:
```dax
IGNORE(
			'BO'[(전체/방송중)한계이익에서 정액수수료(원)을(를) 뺀 값을(를) (전체/방송중)예상취급액(V-)에서 정액수수료(원)을(를) 뺀 값(으)로 나눈 값]
		)
```

### capture-6-5: 카드

원본: PowerBIPerformanceData.json / DAX: docs/power-bi/captures/queries/capture-6-5.dax

기록 필터: {"treatAs":[],"dateLiterals":["2026-10-21","2026-10-22"],"hasAllSelected":false}

- v_전체_방송중_변동비_V__을_를___전체_방송중_예상취급액_V__에서_정액수수료_원_을_를__뺀_값_으_로_나눈_값:
```dax
IGNORE(
			'BO'[(전체/방송중)변동비(V-)을(를) (전체/방송중)예상취급액(V-)에서 정액수수료(원)을(를) 뺀 값(으)로 나눈 값]
		)
```

### capture-6-6: 카드

원본: PowerBIPerformanceData.json / DAX: docs/power-bi/captures/queries/capture-6-6.dax

기록 필터: {"treatAs":[],"dateLiterals":["2026-10-21","2026-10-22"],"hasAllSelected":false}

- v_전체_방송중_예상취급액_V__에서_정액수수료_원_을_를__뺀_값:
```dax
IGNORE(
			'BO'[(전체/방송중)예상취급액(V-)에서 정액수수료(원)을(를) 뺀 값]
		)
```

### capture-6-7: 카드

원본: PowerBIPerformanceData.json / DAX: docs/power-bi/captures/queries/capture-6-7.dax

기록 필터: {"treatAs":[],"dateLiterals":["2026-10-21","2026-10-22"],"hasAllSelected":false}

- v_전체_방송중_변동비_V__:
```dax
IGNORE('BO'[(전체/방송중)변동비(V-)])
```

### capture-6-8: 카드

원본: PowerBIPerformanceData.json / DAX: docs/power-bi/captures/queries/capture-6-8.dax

기록 필터: {"treatAs":[],"dateLiterals":["2026-10-21","2026-10-22"],"hasAllSelected":false}

- v_전체_방송중_한계이익에서_정액수수료_원_을_를__뺀_값:
```dax
IGNORE(
			'BO'[(전체/방송중)한계이익에서 정액수수료(원)을(를) 뺀 값]
		)
```

### capture-6-9: 카드

원본: PowerBIPerformanceData.json / DAX: docs/power-bi/captures/queries/capture-6-9.dax

기록 필터: {"treatAs":[],"dateLiterals":["2026-10-21","2026-10-22"],"hasAllSelected":false}

- Sum가중분:
```dax
IGNORE(CALCULATE(SUM('BO'[가중분])))
```

### capture-6-10: Simple Image

원본: PowerBIPerformanceData.json / DAX: docs/power-bi/captures/queries/capture-6-10.dax

기록 필터: {"treatAs":[],"dateLiterals":["2026-10-21","2026-10-22"],"hasAllSelected":false}


### capture-6-11: 테이블

원본: PowerBIPerformanceData.json / DAX: docs/power-bi/captures/queries/capture-6-11.dax

기록 필터: {"treatAs":[],"dateLiterals":["2026-10-21","2026-10-22"],"hasAllSelected":false}

- Sum노출분:
```dax
CALCULATE(SUM('BO'[노출분]))
```
- Sum가중분:
```dax
CALCULATE(SUM('BO'[가중분]))
```
- v_전체_취급_분_:
```dax
'BO'[(전체)취급(분)]
```
- v_전체_한계_분_:
```dax
'BO'[(전체)한계(분)]
```
- v_전체_방송중_한계_분_:
```dax
'BO'[(전체/방송중)한계(분)]
```
- v_연동_방송중_취급액_분_:
```dax
'BO'[(연동/방송중)취급액(분)]
```
- 분당혼합비:
```dax
'BO'[분당혼합비]
```
- Sumv_전체_방송중_제휴포인트:
```dax
CALCULATE(SUM('BO'[(전체/방송중)제휴포인트]))
```
- v_전체_방송중_한계이익에서_정액수수료_원_을_를__뺀_값을_를___전체_방송중_예상취급액_V__에서_정액수수료_원_을_를__뺀_값_으_로_나눈_값:
```dax
'BO'[(전체/방송중)한계이익에서 정액수수료(원)을(를) 뺀 값을(를) (전체/방송중)예상취급액(V-)에서 정액수수료(원)을(를) 뺀 값(으)로 나눈 값]
```
- Sumv_연동_총주문량:
```dax
CALCULATE(SUM('BO'[(연동)총주문량]))
```
- v_전체_취급달성률___:
```dax
'BO'[(전체)취급달성률(%)]
```
- v_전체_매출달성률___:
```dax
'BO'[(전체)매출달성률(%)]
```
- v_전체_매총달성률___:
```dax
'BO'[(전체)매총달성률(%)]
```
- v_전체_한계달성률___:
```dax
'BO'[(전체)한계달성률(%)]
```
- v_전체_미리주문_취급_목표___:
```dax
'BO'[(전체/미리주문)취급/목표(%)]
```
- Sum판매가_대표상품_:
```dax
CALCULATE(SUM('BO'[판매가(대표상품)]))
```
- Sum정액수수료_원_:
```dax
CALCULATE(SUM('BO'[정액수수료(원)]))
```
- Sumv_연동_방송중_정액外_취급액:
```dax
CALCULATE(SUM('BO'[(연동/방송중)정액外 취급액]))
```
- Sumv_전체_목표매출액_V__:
```dax
CALCULATE(
				SUM('BO'[(전체)목표매출액(V-)])
			)
```
- Sumv_전체_예상매출액_V__:
```dax
CALCULATE(
				SUM('BO'[(전체)예상매출액(V-)])
			)
```
- Sumv_전체_한계이익:
```dax
CALCULATE(SUM('BO'[(전체)한계이익]))
```
- Sumv_전체_한계이익목표:
```dax
CALCULATE(SUM('BO'[(전체)한계이익목표]))
```
- Sumv_전체_예상취급액:
```dax
CALCULATE(SUM('BO'[(전체)예상취급액]))
```
- Sumv_전체_목표취급액:
```dax
CALCULATE(SUM('BO'[(전체)목표취급액]))
```

## 실행 반영 원칙

새 측정값 참조는 bi-metrics.js에 병합한다. 원본 DAX는 자동 실행하지 않는다.
조직별 가중분 비중과 방송일시 고유 개수 비중은 별도 템플릿으로 구현한다. 기간과 분모 범위는 답변에 표시한다.
(1) 원형 차트는 2026년 9월 조직별 가중분 합계이며, (4) 비중 표는 2025-11-01 이상 2026-01-01 미만 + 유형 필터를 포함한다. 이 두 조건을 섞지 않는다.
