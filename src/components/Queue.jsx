import React from "react";
import styles from "./Queue.module.css";

export default function Queue({ queue, currentIndex, onSelect, onRemove, onReorder }) {
  return (
    <div className={styles.queueContainer}>
      <h3>Queue</h3>
      <ul className={styles.queueList}>
        {queue.length === 0 && <li className={styles.empty}>Queue is empty</li>}
        {queue.map((item, idx) => (
          <li
            key={item.id}
            className={idx === currentIndex ? styles.active : ""}
            onClick={() => onSelect(idx)}
          >
            <span className={styles.title}>{item.title || item.name || item.url || "Untitled"}</span>
            <button onClick={e => { e.stopPropagation(); onRemove(idx); }}>Remove</button>
            {idx > 0 && <button onClick={e => { e.stopPropagation(); onReorder(idx, idx - 1); }}>↑</button>}
            {idx < queue.length - 1 && <button onClick={e => { e.stopPropagation(); onReorder(idx, idx + 1); }}>↓</button>}
          </li>
        ))}
      </ul>
    </div>
  );
}
