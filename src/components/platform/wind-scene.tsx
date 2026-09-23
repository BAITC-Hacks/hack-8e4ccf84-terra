export function WindScene({ compact = false }: { compact?: boolean }) {
  return <svg className={`wind-scene ${compact ? "compact" : ""}`} viewBox="0 0 720 420" fill="none" aria-hidden="true">
    <path className="terrain" d="M-40 357L337 177 770 350M-40 387L337 207 770 380M-40 417L337 237 770 410M40 420L412 246M150 420L467 274M260 420L521 301M370 420L579 331" />
    <ellipse className="wind-orbit" cx="371" cy="332" rx="238" ry="60" />
    <ellipse className="wind-orbit inner" cx="371" cy="332" rx="164" ry="38" />
    <g className="turbine far" transform="translate(126 136) scale(.64)"><Turbine /></g>
    <g className="turbine far" transform="translate(492 111) scale(.66)"><Turbine /></g>
    <g className="turbine main-turbine" transform="translate(278 34)"><Turbine /></g>
    <g className="telemetry-lines"><path d="M378 159h112l30-32h86 M378 262H211l-33-30H81" /><circle cx="378" cy="159" r="4" /><circle cx="378" cy="262" r="4" /></g>
    <g className="wind-stream"><path d="M34 172h56 M16 188h74 M572 224h87 M593 240h90" /></g>
  </svg>;
}
function Turbine() {
  return <>
    <ellipse className="foundation" cx="100" cy="295" rx="27" ry="8" />
    <path className="tower" d="M96 111h8l7 181c-4 6-18 6-22 0z" />
    <path className="tower-edge" d="M104 111l7 181" />
    <g className="rotor">
      {[0, 120, 240].map(angle => <path key={angle} transform={`rotate(${angle} 100 110)`} className="blade" d="M99 112C91 84 96 20 103 0c5 30 6 74 3 103l-3 10z" />)}
    </g>
    <circle className="hub" cx="100" cy="110" r="9" /><circle className="hub-center" cx="100" cy="110" r="3" />
  </>;
}
