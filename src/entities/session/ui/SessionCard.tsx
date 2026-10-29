import styles from './SessionCard.module.css';
import { type Session, sessionMean, displayNumber } from '../model/session';

export function SessionCard({
  session,
  onEdit,
  onDelete,
}: {
  session: Session;
  onEdit: (s: Session) => void;
  onDelete: (s: Session) => void;
}) {
  const average = sessionMean(session);

  return (
    <article className={styles.card}>
      <div className={styles.heading}>
        <h3>
          <time dateTime={session.date}>
            {new Date(session.date).toLocaleString('ru-RU', {
              day: 'numeric',
              month: 'long',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
        </h3>
        <span>{session.readings.length} изм.</span>
      </div>
      <div className={styles.mean}>
        <strong>
          {displayNumber(average.systolic)} / {displayNumber(average.diastolic)}
        </strong>
        <span>мм рт. ст.</span>
        <span className={styles.pulse}>
          ♡ {displayNumber(average.pulse)} <small>уд/мин</small>
        </span>
      </div>
      <p className={styles.caption}>Среднее сеанса</p>
      <ol className={styles.readings}>
        {session.readings.map((r, i) => (
          <li key={i}>
            {r.systolic} / {r.diastolic} <span>· пульс {r.pulse ?? '—'}</span>
          </li>
        ))}
      </ol>
      {session.note && <p className={styles.note}>{session.note}</p>}
      <div className={styles.actions}>
        <button onClick={() => onEdit(session)}>Изменить</button>
        <button onClick={() => onDelete(session)}>Удалить</button>
      </div>
    </article>
  );
}
