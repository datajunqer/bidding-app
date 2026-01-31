import express from "express";
import cors from "cors";
import http from "http";
import { Server } from "socket.io";
import cookieParser from "cookie-parser";
import { randomUUID } from "crypto";
import bcrypt from "bcryptjs";

import { createInitialItems, sanitizeItem } from "./itemsStore.js";
import { createItemLock } from "./locks.js";

import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const app = express();

// serve images statically 
app.use("/images", express.static(path.join(__dirname, "images")));

// (optional) quick debug route to confirm the folder path
app.get("/__debug_images", (req, res) => {
    res.json({ imagesDir: path.join(__dirname, "images") });
});


// https://bidding-app-web-nhr9.onrender.com
/* ---------------- CORS ---------------- */
const allowedOrigins = [
    "http://localhost:5173",
    "https://bidding-app-web-nhr9.onrender.com" // <-- replace with your real Render frontend URL
];

app.use(
    cors({
        origin: (origin, cb) => {
            // allow non-browser clients (no origin) and allowed origins
            if (!origin) return cb(null, true);
            if (allowedOrigins.includes(origin)) return cb(null, true);
            return cb(new Error("Not allowed by CORS"));
        },
        credentials: true
    })
);

app.use(express.json());
app.use(cookieParser());

/* ---------------- In-memory stores ---------------- */
// userId -> { userId, passwordHash }
const users = new Map();

// sid -> { userId }
const sessions = new Map();

/* ---------------- Helpers ---------------- */
function getSid(req) {
    return req.cookies?.sid || null;
}

function getSession(req) {
    const sid = getSid(req);
    return sid ? sessions.get(sid) : null;
}

/* ---------------- Auth APIs ---------------- */
app.post("/auth/register", async (req, res) => {
    const userId = String(req.body?.userId || "").trim();
    const password = String(req.body?.password || "");

    if (userId.length < 3) {
        return res.status(400).json({ ok: false, error: "userId must be at least 3 chars" });
    }
    if (password.length < 6) {
        return res.status(400).json({ ok: false, error: "password must be at least 6 chars" });
    }
    if (users.has(userId)) {
        return res.status(409).json({ ok: false, error: "userId already exists" });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    users.set(userId, { userId, passwordHash });

    return res.json({ ok: true });
});

app.post("/auth/login", async (req, res) => {
    const userId = String(req.body?.userId || "").trim();
    const password = String(req.body?.password || "");

    const user = users.get(userId);
    if (!user) {
        return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) {
        return res.status(401).json({ ok: false, error: "Invalid credentials" });
    }

    const sid = randomUUID();
    sessions.set(sid, { userId });

    res.cookie("sid", sid, {
        httpOnly: true,
        sameSite: "lax"
        // secure: true // enable in HTTPS production
    });

    return res.json({ ok: true, userId });
});

app.post("/auth/logout", (req, res) => {
    const sid = getSid(req);
    if (sid) sessions.delete(sid);

    res.clearCookie("sid", { sameSite: "lax" });
    return res.json({ ok: true });
});

app.get("/auth/me", (req, res) => {
    const session = getSession(req);
    return res.json({
        ok: true,
        user: session ? { userId: session.userId } : null
    });
});

/* ---------------- Auction state ---------------- */
const items = createInitialItems();
const withLock = createItemLock();

/* ---------------- Items API ---------------- */
app.get("/items", (req, res) => {
    const session = getSession(req);

    res.json({
        serverTime: Date.now(),
        me: session ? { userId: session.userId } : null,
        items: items.map(sanitizeItem)
    });
});

/* ---------------- Socket.io ---------------- */
const server = http.createServer(app);

const io = new Server(server, {
    cors: {
        origin: allowedOrigins,
        credentials: true
    }
});

/* Parse cookies from socket handshake */
function parseCookie(header) {
    const out = {};
    if (!header) return out;
    header.split(";").forEach((p) => {
        const [k, ...v] = p.trim().split("=");
        out[k] = decodeURIComponent(v.join("="));
    });
    return out;
}

/* Socket auth middleware */
io.use((socket, next) => {
    const cookies = parseCookie(socket.handshake.headers.cookie || "");
    const sid = cookies.sid;
    const session = sid ? sessions.get(sid) : null;

    if (!session) return next(new Error("Unauthorized"));
    socket.data.userId = session.userId;
    next();
});

io.on("connection", (socket) => {
    socket.on("BID_PLACED", async ({ itemId, amount }, callback) => {
        const bidderId = socket.data.userId;
        const item = items.find((i) => i.id === itemId);

        if (!item) {
            return callback({ ok: false, code: "NOT_FOUND" });
        }

        await withLock(itemId, async () => {
            // auction ended
            if (Date.now() >= item.endsAt) {
                return callback({ ok: false, code: "AUCTION_ENDED" });
            }

            //  already winning 
            if (item.highestBidder === bidderId) {
                return callback({ ok: false, code: "ALREADY_WINNING" });
            }

            // invalid / lower bid
            if (typeof amount !== "number" || amount <= item.currentBid) {
                return callback({ ok: false, code: "OUTBID" });
            }

            item.currentBid = amount;
            item.highestBidder = bidderId;

            io.emit("UPDATE_BID", {
                item: sanitizeItem(item),
                bidderId,
                serverTime: Date.now()
            });

            return callback({ ok: true });
        });
    });
});

const PORT = process.env.PORT || 4000;

server.listen(PORT, () => {
    console.log(`Backend running on port ${PORT}`);
});
