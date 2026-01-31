# Live Bidding Platform

A real-time auction platform where users compete to place bids on items during the final seconds of an auction.  
Built with **Node.js, Socket.io, and React**, focusing on correctness, synchronization, and race-condition handling.

---

## Features

- Real-time bidding using WebSockets (Socket.io)
- Server-authoritative auction timing
- Correct handling of concurrent bids (race conditions)
- Per-tab user identity (simulates multiple users locally)
- Live countdown timer synced with server time
- Visual feedback for bid updates
  - Green flash on any new bid
  - Persistent “Outbid” state when a user loses the lead
  - “Winning” badge when the user is the highest bidder
- Docker support for backend service

---

## Architecture Overview

### Backend (Node.js + Socket.io)
- Maintains in-memory auction state
- Exposes REST API for initial state
- Uses WebSockets for real-time bid updates
- Ensures auction rules are enforced server-side

### Frontend (React + Socket.io Client)
- Fetches initial auction state via REST
- Subscribes to live bid updates via WebSockets
- Calculates countdown timers using **server-synced time**
- Manages UI feedback (winning, outbid, animations)

---

## Race Condition Handling

To handle concurrent bids safely:

- The server processes bids **sequentially** in the event loop.
- Each bid is validated against the current server state:
  - Bid amount must be higher than the current bid
  - Auction must still be active
- If two bids arrive at the same millisecond:
  - The first valid bid updates the state
  - The second bid is immediately rejected with an `OUTBID` response

This guarantees consistency without relying on client timing.

---

## Time Synchronization

- The backend sends `serverTime` with API responses and socket events.
- The frontend computes a `serverOffset` once and uses it for all countdown calculations.
- Countdown timers cannot be manipulated by altering client system time.

---

## Running Locally

### Backend
```bash
cd server
npm install
npm start
