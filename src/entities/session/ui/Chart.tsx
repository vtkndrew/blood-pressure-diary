import { type Session, sessionMean } from '../model/session';

export function Chart({ sessions, pulse = false }: { sessions: Session[]; pulse?: boolean }) {
  const points = [...sessions].reverse().map((s) => ({ date: s.date, ...sessionMean(s) }));
  const keys: ('systolic' | 'diastolic' | 'pulse')[] = pulse
    ? ['pulse']
    : ['systolic', 'diastolic'];
  const values = points.flatMap((p) => keys.flatMap((k) => (p[k] === null ? [] : [p[k]])));

  if (!values.length) {
    return <p>Нет измерений для графика.</p>;
  }

  const low = Math.max(0, Math.floor(Math.min(...values) / 10) * 10 - 10);
  const high = Math.ceil(Math.max(...values) / 10) * 10 + 10;
  const start = Date.parse(points[0].date);
  const end = Date.parse(points[points.length - 1].date);
  const x = (date: string) =>
    end === start ? 280 : 52 + ((Date.parse(date) - start) / (end - start)) * 488;
  const y = (value: number) => 170 - ((value - low) / (high - low)) * 140;

  return (
    <figure style={{ margin: 0 }}>
      <svg
        viewBox="0 0 580 220"
        role="img"
        aria-label={
          pulse ? 'График среднего пульса по сеансам' : 'График среднего давления по сеансам'
        }
        style={{ width: '100%', display: 'block' }}
      >
        {[low, (low + high) / 2, high].map((value) => (
          <g key={value}>
            <line x1="48" x2="550" y1={y(value)} y2={y(value)} stroke="#dce5df" />
            <text x="40" y={y(value) + 4} textAnchor="end" fontSize="12" fill="#63766c">
              {value}
            </text>
          </g>
        ))}
        {keys.map((key, index) => (
          <g
            key={key}
            fill={pulse ? '#b46b54' : ['#2b6855', '#8fa862'][index]}
            stroke={pulse ? '#b46b54' : ['#2b6855', '#8fa862'][index]}
          >
            <polyline
              points={points
                .filter((p) => p[key] !== null)
                .map((p) => `${x(p.date)},${y(p[key] ?? 0)}`)
                .join(' ')}
              fill="none"
              strokeWidth="2.5"
            />
            {points.map((p, i) =>
              p[key] === null ? null : (
                <circle key={i} cx={x(p.date)} cy={y(p[key] ?? 0)} r="4">
                  <title>
                    {p.date.replace('T', ' ')}: {p[key]?.toFixed(1)}
                  </title>
                </circle>
              ),
            )}
          </g>
        ))}
        <text x="48" y="204" fontSize="12" fill="#63766c">
          {points[0].date.slice(0, 10)}
        </text>
        <text x="550" y="204" textAnchor="end" fontSize="12" fill="#63766c">
          {points[points.length - 1].date.slice(0, 10)}
        </text>
      </svg>
      <figcaption>
        {pulse
          ? 'Пульс · уд/мин'
          : 'Давление · мм рт. ст. · тёмная линия — верхнее, светлая — нижнее'}
        . Одна точка — среднее сеанса. Исходные значения доступны в журнале.
      </figcaption>
    </figure>
  );
}
