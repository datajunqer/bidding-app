import { useEffect, useMemo, useState } from "react";

function formatMs(ms) {
    if (ms <= 0) return "00:00";
    const totalSec = Math.floor(ms / 1000);
    const m = String(Math.floor(totalSec / 60)).padStart(2, "0");
    const s = String(totalSec % 60).padStart(2, "0");
    return `${m}:${s}`;
}

export default function ItemCard({
    item,
    myUserId,
    serverOffsetMs,
    onBid,
    flashGreen,
    outbid
}) {
    const [tick, setTick] = useState(0);

    useEffect(() => {
        const id = setInterval(() => setTick((x) => x + 1), 250);
        return () => clearInterval(id);
    }, []);

    const serverNow = Date.now() + serverOffsetMs;
    const remainingMs = item.endsAt - serverNow;

    const ended = remainingMs <= 0;
    const isWinning = !ended && item.highestBidder === myUserId;

    const cardClass = useMemo(() => {
        let c = "card";
        if (flashGreen) c += " flash-green";
        if (outbid) c += " flash-red";
        if (ended) c += " ended";
        return c;
    }, [flashGreen, outbid, ended]);

    return (
        <div className={cardClass}>
            <div className="row">
                <div className="title">{item.title}</div>
                <div className="badges">
                    {isWinning ? <span className="badge winning">Winning</span> : null}
                    {outbid && !ended ? <span className="badge outbid">Outbid</span> : null}
                    {ended ? <span className="badge ended">Ended</span> : null}
                </div>
            </div>

            <div className="price">${item.currentBid}</div>
            <div className="timer">Time left: {formatMs(remainingMs)}</div>

            <button
                className="btn"
                disabled={ended}
                onClick={() => onBid(item.id, item.currentBid + 10)}
            >
                Bid +$10
            </button>
        </div>
    );
}
