import { readConfig } from './lib/readData';
import { playWeek, type Policy } from './lib/weekSim';

// npm run balance: 세 가지 플레이 방식으로 한 주를 돌려 날마다 배터리·생활 지표·돈을 표로 보여 준다.
// 밸런스 수치를 바꾼 뒤 '적당히'가 버티고, '전부 회피'·'전부 수용'이 각각 실패하는지 바로 확인한다.

const game = readConfig();
const commuteSec = Number(process.argv[2] ?? 120);

for (const policy of ['avoid', 'accept', 'balanced'] as Policy[]) {
  const r = playWeek(game, policy, { commuteSec });
  console.log(`\n■ ${policy}  (출퇴근 ${commuteSec}초)`);
  for (const d of r.rows) {
    const l = d.life;
    console.log(
      `  ${d.day.padEnd(7)} 상한 ${d.maxBattery.toFixed(0).padStart(3)}  밤 배터리 ${d.batteryEnd.toFixed(0).padStart(3)}  대화 ${d.talks}  소득 ${l['income']} 주거 ${l['housing']} 필수 ${l['essentials']} 관계 ${l['bond']}  돈 ${d.money.toLocaleString('ko-KR')}`,
    );
  }
  console.log(`  → ${r.failed ? `${r.day}에 실패: ${r.failed}${r.stat ? ` (${r.stat})` : ''}` : '한 주를 버팀'}`);
}
