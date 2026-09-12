import type { CSSProperties } from "react";

type HeroEntry = {
  id: number;
  name: string;
  factions: number[];
  bond4: string;
  bond5: string;
};

type SingleEntry = {
  title: string;
  id: number;
  name: string;
  tone: "dist" | "equip" | "sp" | "upgrade";
};

type LawEntry = { id: number; name: string };

type UpdateRow = {
  date: string;
  season: string;
  heroTitle: string;
  acquireNote?: string;
  heroes: HeroEntry[];
  singles?: SingleEntry[];
  law?: LawEntry[];
  newSoldiers?: string[];
  spSoldiers?: string[];
  patches: string[];
};

const FACTION_NAMES: Record<number, string> = {
  1: "시대의 주역",
  2: "빛의 군단",
  3: "빛의 기원",
  4: "제국의 빛",
  5: "어둠의 윤회",
  6: "공주 연맹",
  7: "전략의 대가",
  8: "메테오 스트라이크",
  9: "전설의 저편",
  10: "시공의 중심",
  11: "초월 영역",
  12: "리인카네이션 전생",
};

const UPDATE_ROWS: UpdateRow[] = [
  {
    date: "9/23",
    season: "서밋 S23",
    heroTitle: "신규 영웅",
    acquireNote: "페이백 패스로 획득",
    heroes: [
      { id: 99272, name: "무닝", factions: [8, 5, 7], bond4: "X", bond5: "X" },
      { id: 99273, name: "태초의 젤다", factions: [8, 5, 12], bond4: "X", bond5: "X" },
    ],
    singles: [
      { title: "전용장비", id: 99229, name: "셀리카", tone: "equip" },
      { title: "SP전직", id: 56, name: "레이첼", tone: "sp" },
    ],
    patches: [],
  },
  {
    date: "10/21",
    season: "서밋 S23",
    heroTitle: "신규 영웅",
    heroes: [
      { id: 99275, name: "아오라", factions: [3, 8, 11], bond4: "란카", bond5: "X" },
      { id: 99274, name: "란카", factions: [2, 3, 7], bond4: "아오라", bond5: "X" },
    ],
    singles: [{ title: "전용장비", id: 99253, name: "아브샤이트", tone: "equip" }],
    law: [
      { id: 99227, name: "타브리스" },
      { id: 126, name: "팟시르" },
      { id: 99215, name: "안드리올" },
      { id: 99234, name: "티아나" },
    ],
    spSoldiers: ["헬하운드", "파도의 정령", "팔랑크스", "가고일"],
    patches: [
      "명예던전 맵 3개 추가",
      "만상의 길 신규 각인 2종 추가",
      "시공행상인 화폐 교환 SSR책, 율정재료, 초연마음, 영혼 및 원주 교환 가능\n재료 최소로 남기는 갯수 설정가능",
      "서밋 아레나 테스트모드 영웅 성급, 마부 변경 지원",
    ],
  },
  {
    date: "11/18",
    season: "서밋 S23",
    heroTitle: "테카맨 콜라보",
    heroes: [
      { id: 99277, name: "D-BOY", factions: [1, 12, 10], bond4: "X", bond5: "X" },
      { id: 99278, name: "아이바 신야", factions: [8, 12, 10], bond4: "X", bond5: "X" },
    ],
    singles: [
      { title: "배포", id: 99276, name: "아이바 미유키", tone: "dist" },
      { title: "전용장비", id: 99255, name: "엘비스", tone: "equip" },
    ],
    patches: [
      "10차 장비패스",
      "각성기 컷신 변경 스킨에 변경 컷신 미리보기 기능 추가",
      "토이바르, 밀레니엄WS, 테카맨 블레이드 BGM 추가",
      "서밋아레나 토너먼트 1경기부터 맵, 선후공 확인하고 서브덱 사용 및 교체 가능\n서브덱 12자리로 증가",
    ],
  },
  {
    date: "12/16",
    season: "서밋 S24",
    heroTitle: "신규 영웅",
    heroes: [
      { id: 99280, name: "사륜", factions: [4, 5, 12], bond4: "아시", bond5: "X" },
      { id: 99279, name: "아시", factions: [5, 8, 12], bond4: "사륜", bond5: "X" },
    ],
    singles: [
      { title: "전용장비", id: 99252, name: "루크만", tone: "equip" },
      { title: "SP전직", id: 67, name: "오메가", tone: "sp" },
    ],
    law: [
      { id: 99226, name: "테란틸" },
      { id: 99198, name: "아마데우스" },
      { id: 99216, name: "에쉬앤" },
      { id: 99240, name: "사프린" },
    ],
    spSoldiers: ["영종의 투승", "용암 샤먼", "마스터 디노", "데몬헌터"],
    patches: [
      "밀레니엄 DC 스토리 2장 추가",
      "환령-만상 비슷한 용암의 여정 컨텐츠 신규 출시",
      "환령 및 만상 착용 해당 주년캐릭터 한정으로 귀속",
      "SSR 오메가 or 만능조각 20개 선택권 배포",
    ],
  },
  {
    date: "1/13",
    season: "서밋 S24",
    heroTitle: "신규 영웅",
    heroes: [{ id: 99281, name: "효랑어홍사", factions: [9, 6, 12], bond4: "X", bond5: "X" }],
    singles: [
      { title: "전용장비", id: 99239, name: "이리아", tone: "equip" },
      { title: "SSR 승급", id: 44, name: "레아드", tone: "upgrade" },
    ],
    patches: [
      "서밋아레나 신규맵 출시",
      "별바다의 끝(신랑토체스) 업데이트\n최종등수 낮을 때 점수차감 삭제, 아이템 및 시공조건 변경",
    ],
  },
  {
    date: "2/10",
    season: "서밋 S24",
    heroTitle: "신규 영웅",
    heroes: [
      { id: 99282, name: "은(밴시)", factions: [8, 7, 9], bond4: "레이가", bond5: "X" },
      { id: 99283, name: "아윈(쿠모)", factions: [6, 11, 7], bond4: "패트리샤", bond5: "X" },
    ],
    singles: [{ title: "전용장비", id: 99254, name: "레이아", tone: "equip" }],
    law: [
      { id: 99203, name: "님프" },
      { id: 99233, name: "시온" },
      { id: 99249, name: "마카엘라" },
      { id: 99231, name: "비리아" },
    ],
    spSoldiers: ["근위창병", "신성 호위술사", "그레나디어", "천공사수"],
    patches: [
      "시공원정군 재출시 및 업데이트 길드 순위 및 보상 삭제\n그만큼 원정군 상점 보상 조정 연속전투, 자동보급, 재전투 추가\n용병 사용 가능, 진행 관련 편의성, 보급 시기 개선",
      "토이바르 산과 숲의 장 4장 추가",
      "환령/만상 각인 장착 가능 영웅 인게임에서 목록 확인 가능",
      "친구의 서밋아레나 랭킹전과 캐주얼 모드 관전 및 채팅 가능",
    ],
  },
  {
    date: "3/10",
    season: "서밋 S24",
    heroTitle: "슈라토 콜라보",
    heroes: [
      { id: 99285, name: "수라왕 슈라토", factions: [1, 12, 10], bond4: "X", bond5: "X" },
      { id: 99284, name: "야차왕 가이", factions: [5, 12, 10], bond4: "X", bond5: "X" },
    ],
    singles: [
      { title: "배포", id: 99286, name: "가루다왕 레이가", tone: "dist" },
      { title: "전용장비", id: 99259, name: "레이피어", tone: "equip" },
    ],
    patches: [
      "용암의 여정 신규지역 추가",
      "11차 장비패스",
      "장비패스 장비 교환가능 횟수 4회에서 6회로 증가",
      "콜라보 배너에서 400뽑 달성 시 영웅전환(구제) 시스템 작동\n확업 2캐릭터 중 하나의 60조각을 다른 대상 60조각으로 변경 가능",
    ],
  },
  {
    date: "4/7",
    season: "서밋 S25",
    heroTitle: "신규 영웅",
    heroes: [{ id: 99287, name: "마해검사", factions: [12, 5, 11], bond4: "X", bond5: "X" }],
    singles: [
      { title: "전용장비", id: 99225, name: "빙설 심연의\n지배자", tone: "equip" },
      { title: "SP전직", id: 37, name: "쥬그라", tone: "sp" },
    ],
    law: [
      { id: 99197, name: "각성자" },
      { id: 99221, name: "군" },
    ],
    newSoldiers: ["창병", "마족"],
    spSoldiers: ["거대 랍스터", "수정 마도사", "사무라이", "중장기병"],
    patches: [
      "2950일 로그인 보상 추가",
      "일일퀘스트 완료 조건 중 시공의 균열 3회 클리어 삭제",
      "시공행상인 무지개 열쇠 교환가능",
      "오토아레나 원버튼 전투완료 가능",
      "서밋아레나 다전제 경기 후 경기 선택해서 리플레이 재생가능\n게임 시작 전 예비덱 안보이게 변경",
      "SSR 쥬그라 or 만능조각 20개 선택권 배포",
    ],
  },
];

function publicAsset(path: string) {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.endsWith("/") ? base : `${base}/`}${path.replace(/^\/+/, "")}`;
}

function heroImage(id: number) {
  return publicAsset(`images/heroes/card-icons-webp/${id}.webp`);
}

function factionImage(id: number) {
  return publicAsset(`images/factions/${id}.png`);
}

function HeroCard({ hero }: { hero: HeroEntry }) {
  return (
    <div className="hut-hero-card">
      <div className="hut-portrait">
        <img src={heroImage(hero.id)} alt="" />
        <strong>{hero.name}</strong>
      </div>
      <div className="hut-hero-meta">
        <div className="hut-factions">
          {hero.factions.map((id) => (
            <img key={id} src={factionImage(id)} alt={FACTION_NAMES[id] ?? ""} title={FACTION_NAMES[id]} />
          ))}
        </div>
        <div className="hut-bond"><b>4번</b><span>{hero.bond4}</span></div>
        <div className="hut-bond"><b>5번</b><span>{hero.bond5}</span></div>
      </div>
    </div>
  );
}

function MiniCard({ id, name }: { id: number; name: string }) {
  return (
    <div className="hut-mini-card">
      <img src={heroImage(id)} alt="" />
      <span>{name}</span>
    </div>
  );
}

function HeroCell({ row }: { row: UpdateRow }) {
  return (
    <section className="hut-cell hut-hero-cell">
      <div className={`hut-head ${row.acquireNote ? "hut-hero-head-grid" : ""}`}>
        <span>{row.heroTitle}</span>
        {row.acquireNote ? <span>{row.acquireNote}</span> : null}
      </div>
      <div className="hut-hero-pair">
        {row.heroes.map((hero) => <HeroCard key={hero.id} hero={hero} />)}
        {row.heroes.length === 1 ? <div aria-hidden="true" /> : null}
      </div>
    </section>
  );
}

function SingleCell({ entry }: { entry: SingleEntry }) {
  return (
    <section className={`hut-cell hut-single hut-${entry.tone}`}>
      <div className="hut-head">{entry.title}</div>
      <MiniCard id={entry.id} name={entry.name} />
    </section>
  );
}

function LawCell({ entries }: { entries: LawEntry[] }) {
  return (
    <section className="hut-cell hut-law">
      <div className="hut-head">중앙율정</div>
      <div className="hut-law-grid">
        {entries.map((entry) => <MiniCard key={entry.id} id={entry.id} name={entry.name} />)}
      </div>
    </section>
  );
}

function SoldierCell({ title, entries, kind }: { title: string; entries: string[]; kind: "new" | "sp" }) {
  return (
    <section className={`hut-cell hut-soldier ${kind === "new" ? "hut-new-soldier" : ""}`}>
      <div className="hut-head">{title}</div>
      <div className="hut-soldier-list">{entries.map((entry) => <span key={entry}>{entry}</span>)}</div>
    </section>
  );
}

function PatchCell({ entries }: { entries: string[] }) {
  return (
    <section className="hut-cell hut-patch">
      <div className="hut-head">패치 내용</div>
      <ul>
        {entries.map((entry) => {
          const lines = entry.split("\n");
          return <li key={entry}>{lines.map((line, index) => <span key={`${line}-${index}`}>{line}{index < lines.length - 1 ? <br /> : null}</span>)}</li>;
        })}
      </ul>
    </section>
  );
}

function rowColumns(row: UpdateRow) {
  const cols = ["78px", "360px"];
  row.singles?.forEach(() => cols.push("78px"));
  if (row.law?.length) cols.push(row.law.length <= 2 ? "92px" : "104px");
  if (row.newSoldiers?.length) cols.push("78px");
  if (row.spSoldiers?.length) cols.push("72px");
  cols.push("minmax(300px,1fr)");
  return cols.join(" ");
}

const TABLE_CSS = `
.home-update-table{--hut-line:#d7dee7;--hut-text:#172033;--hut-muted:#667286;color:var(--hut-text)}
.home-update-table .hut-scroll{width:100%;overflow-x:auto;padding-bottom:2px}
.home-update-table .hut-list{display:grid;gap:10px;width:1160px}
.home-update-table .hut-row{width:1160px;overflow:hidden;border:1px solid var(--hut-line);border-radius:12px;background:#fff}
.home-update-table .hut-grid{display:grid;width:1160px;min-height:126px;align-items:stretch}
.home-update-table .hut-date{display:flex;flex-direction:column;align-items:center;justify-content:center;border-right:1px solid var(--hut-line);background:#fbfcfe;padding:10px 6px;text-align:center;font-size:17px;font-weight:950}
.home-update-table .hut-date small{margin-top:4px;color:var(--hut-muted);font-size:9.5px;font-weight:700}
.home-update-table .hut-cell{min-width:0;border-right:1px solid var(--hut-line);padding:9px 7px}
.home-update-table .hut-cell:last-child{border-right:0}
.home-update-table .hut-head{min-height:14px;margin-bottom:5px;color:#5f6979;font-size:9.5px;font-weight:900;line-height:14px}
.home-update-table .hut-hero-head-grid{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.home-update-table .hut-hero-head-grid span{text-align:left;color:inherit}
.home-update-table .hut-hero-cell{overflow:hidden;background:#fafbfd}
.home-update-table .hut-hero-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:6px}
.home-update-table .hut-hero-card{display:grid;grid-template-columns:78px minmax(0,1fr);gap:6px;min-width:0;overflow:hidden;border:1px solid #d7dee7;border-radius:8px;background:#fff;padding:7px 5px}
.home-update-table .hut-portrait{text-align:center;min-width:0}
.home-update-table .hut-portrait img{display:block;width:76px;height:76px;max-width:100%;margin:auto;border-radius:7px;object-fit:contain}
.home-update-table .hut-portrait strong{display:block;margin-top:3px;font-size:10.5px;line-height:1.15;white-space:normal}
.home-update-table .hut-hero-meta{min-width:0;padding-top:2px}
.home-update-table .hut-factions{display:flex;flex-wrap:nowrap;gap:3px;margin-bottom:7px}
.home-update-table .hut-factions img{width:19px;height:19px;flex:0 0 19px;object-fit:contain}
.home-update-table .hut-bond{display:grid;grid-template-columns:27px minmax(0,1fr);gap:3px;font-size:11.5px;line-height:1.5;white-space:nowrap}
.home-update-table .hut-bond b{font-weight:950}.home-update-table .hut-bond span{overflow:hidden;text-overflow:ellipsis}
.home-update-table .hut-single{display:flex;flex-direction:column;text-align:center;background:#fce7cf}
.home-update-table .hut-dist{background:#f4deda}.home-update-table .hut-sp,.home-update-table .hut-upgrade{background:#eef6ea}
.home-update-table .hut-mini-card{display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:3px;text-align:center;font-size:9.5px;font-weight:900}
.home-update-table .hut-mini-card img{width:62px;height:62px;max-width:100%;border-radius:7px;object-fit:contain}
.home-update-table .hut-mini-card span{white-space:pre-line}
.home-update-table .hut-law{display:flex;flex-direction:column;background:#fff8dd;text-align:center}
.home-update-table .hut-law-grid{display:grid;grid-template-columns:repeat(2,42px);flex:1;align-content:center;justify-content:center;column-gap:0;row-gap:0}
.home-update-table .hut-law .hut-mini-card{gap:1px;font-size:9px}.home-update-table .hut-law .hut-mini-card img{width:40px;height:40px}
.home-update-table .hut-soldier{display:flex;flex-direction:column;background:#e6effc;text-align:center}.home-update-table .hut-new-soldier{background:#eaf3fa}
.home-update-table .hut-soldier-list{display:grid;grid-template-columns:1fr;flex:1;align-content:center;gap:3px}
.home-update-table .hut-soldier-list span{display:block;border:1px solid #cfd9d4;border-radius:6px;background:#fff;padding:4px 1px;text-align:center;font-size:9px;font-weight:850;white-space:nowrap}
.home-update-table .hut-patch{display:flex;min-width:0;flex-direction:column;background:#f5e8ee;padding-right:18px}
.home-update-table .hut-patch ul{min-width:0;flex:1;align-content:center;margin:0;padding-left:15px;font-size:10.5px;line-height:1.52;word-break:keep-all;overflow-wrap:break-word;line-break:strict;text-wrap:pretty}
.home-update-table .hut-patch li{max-width:100%}.home-update-table .hut-patch li+li{margin-top:2px}
@media(max-width:820px){.home-update-table .hut-list,.home-update-table .hut-row,.home-update-table .hut-grid{width:1160px}.home-update-table .hut-grid{min-height:114px}.home-update-table .hut-cell{padding:7px 5px}}
`;

export function HomeUpdatesTable() {
  return (
    <div className="home-update-table">
      <style>{TABLE_CSS}</style>
      <div className="hut-scroll" aria-label="업데이트 일정 표">
        <div className="hut-list">
          {UPDATE_ROWS.map((row) => (
            <article key={row.date} className="hut-row">
              <div className="hut-grid" style={{ gridTemplateColumns: rowColumns(row) } as CSSProperties}>
                <div className="hut-date">{row.date}<small>{row.season}</small></div>
                <HeroCell row={row} />
                {row.singles?.map((entry) => <SingleCell key={`${row.date}-${entry.title}`} entry={entry} />)}
                {row.law?.length ? <LawCell entries={row.law} /> : null}
                {row.newSoldiers?.length ? <SoldierCell title="신규용병" entries={row.newSoldiers} kind="new" /> : null}
                {row.spSoldiers?.length ? <SoldierCell title="SP용병" entries={row.spSoldiers} kind="sp" /> : null}
                <PatchCell entries={row.patches} />
              </div>
            </article>
          ))}
        </div>
      </div>
    </div>
  );
}
