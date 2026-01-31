// server/src/itemsStore.js

/**
 * Industrial-ish approach without changing your folder structure:
 * - Keep item definitions in one place (ITEMS_CATALOG)
 * - Generate runtime auction fields (currentBid, endsAt, slot)
 * - Slot is assigned by the order of ending time (earliest ends => slot 1)
 */

function mkId(n) {
    return `item-${String(n).padStart(2, "0")}`;
}

// 30 items across multiple categories
const ITEMS_CATALOG = [
    // Electronics
    { title: "Wireless Headphones", category: "Electronics", startingPrice: 50 },
    { title: "Mechanical Keyboard", category: "Electronics", startingPrice: 80 },
    { title: "Smart Speaker", category: "Electronics", startingPrice: 45 },
    { title: "External SSD 1TB", category: "Electronics", startingPrice: 90 },
    { title: "4K Monitor 27-inch", category: "Electronics", startingPrice: 180 },

    // Furniture
    { title: "Ergonomic Office Chair", category: "Furniture", startingPrice: 120 },
    { title: "Standing Desk Converter", category: "Furniture", startingPrice: 95 },
    { title: "Bookshelf 5-Tier", category: "Furniture", startingPrice: 70 },
    { title: "Bedside Table", category: "Furniture", startingPrice: 45 },

    // Toys
    { title: "LEGO Starter Set", category: "Toys", startingPrice: 35 },
    { title: "Remote Control Car", category: "Toys", startingPrice: 40 },
    { title: "Puzzle 1000 Pieces", category: "Toys", startingPrice: 20 },
    { title: "Plush Teddy Bear", category: "Toys", startingPrice: 18 },

    // Sports
    { title: "Basketball", category: "Sports", startingPrice: 25 },
    { title: "Yoga Mat", category: "Sports", startingPrice: 22 },
    { title: "Adjustable Dumbbells", category: "Sports", startingPrice: 110 },
    { title: "Badminton Racket Set", category: "Sports", startingPrice: 30 },
    { title: "Tennis Balls Pack", category: "Sports", startingPrice: 12 },

    // Stationery
    { title: "Notebook Set (3 pack)", category: "Stationery", startingPrice: 10 },
    { title: "Fountain Pen", category: "Stationery", startingPrice: 28 },
    { title: "Desk Organizer", category: "Stationery", startingPrice: 16 },
    { title: "Sticky Notes Bundle", category: "Stationery", startingPrice: 8 },
    { title: "Planner 2026", category: "Stationery", startingPrice: 14 },

    // Kitchen
    { title: "Air Fryer", category: "Kitchen", startingPrice: 85 },
    { title: "Coffee Grinder", category: "Kitchen", startingPrice: 38 },
    { title: "Chef Knife", category: "Kitchen", startingPrice: 32 },

    // Books
    { title: "Bestseller Hardcover", category: "Books", startingPrice: 15 },
    { title: "Data Science Handbook", category: "Books", startingPrice: 55 },

    // Gaming
    { title: "Gaming Controller", category: "Gaming", startingPrice: 45 },

    // Tools
    { title: "Cordless Drill", category: "Tools", startingPrice: 75 }
];

// Auction timing configuration
const AUCTION_START_DELAY_MS = 10_000; // auctions end at least 10s from server start
const SLOT_GAP_MS = 45_000; // each next slot ends 45s after previous (tweak as you like)

export function createInitialItems() {
    const now = Date.now();
    const baseEnd = now + AUCTION_START_DELAY_MS;

    // Create items with deterministic endsAt in the order of the catalog list
    const seeded = ITEMS_CATALOG.map((x, idx) => {
        const endsAt = baseEnd + idx * SLOT_GAP_MS;
        return {
            id: mkId(idx + 1),
            title: x.title,
            category: x.category,
            startingPrice: x.startingPrice,
            currentBid: x.startingPrice,
            highestBidder: null,
            endsAt
        };
    });

    // Assign slot number by ordering of endsAt (earliest end => slot 1)
    // This makes the requirement explicit and future-proof even if you randomize times later.
    const byEndAsc = [...seeded].sort((a, b) => a.endsAt - b.endsAt);
    const slotById = new Map(byEndAsc.map((item, i) => [item.id, i + 1]));

    return seeded.map((item) => ({
        ...item,
        slot: slotById.get(item.id)
    }));
}

export function sanitizeItem(item) {
    // only return fields the client needs
    return {
        id: item.id,
        title: item.title,
        category: item.category,
        slot: item.slot,
        startingPrice: item.startingPrice,
        currentBid: item.currentBid,
        highestBidder: item.highestBidder,
        imageUrl: "http://localhost:4000/images/dummy.jpg",
        endsAt: item.endsAt
    };
}
