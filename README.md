# My Shop VIP

Frontend aur backend alag folders, servers aur ports par chalte hain. Frontend backend se REST API aur configurable API URL ke through connected hai:

- `frontend/` — sirf HTML, CSS, browser JavaScript aur static assets
- `backend/` — REST API, admin authentication, checkout, product/order logic, aur database access
- `frontend/config.js` — API base URL (frontend server `.env` values se is file ko runtime par generate karta hai)
- `scripts/` — local static-file server aur dono services ka launcher
- `data/shop.sqlite` — local product, cart aur order data (automatically create hota hai)

## Run locally

1. Node.js 22.5 ya newer install karein.
2. Project root mein `.env` file mein frontend port, backend port, admin login aur database configuration set karein. Template ke liye `.env.example` dekhein.
3. Dono servers ke liye project root mein `npm start` run karein.
4. `.env` mein configured frontend URL kholo (default `http://localhost:5175`); admin page `/admin` par hai. Backend API alag port par chalta hai (default `http://localhost:3010/api`).

Alag terminals mein chalane ke liye `npm run backend` aur `npm run frontend` use karein. `.env` local/private config hai aur Git se ignore hoti hai. Backend CORS sirf `FRONTEND_ORIGIN` ko allow karta hai. MongoDB orders enable karne ke liye `MONGODB_URI` set karein; products/cart/stock SQLite mein hain. Public hosting se pehle admin password badlein.

Starter catalog demo products se seed hota hai. Checkout par COD aur UPI choice hai. Apna QR image `frontend/payment-qr.png` naam se rakhein, ya `.env` mein `PAYMENT_QR_IMAGE` path badlein; apna UPI address `UPI_ID` mein set karein. QR/UPI ke through payment manually verify hota hai; automatic payment confirmation ke liye merchant gateway credentials/webhook chahiye.

Footer se About, Contact, Return, Refund, Privacy aur Disclaimer pages open hote hain. Contact form messages database mein save hote hain aur admin dashboard ke Messages tab mein dikhte hain. Public launch se pehle `.env` mein `LEGAL_NAME`, `CONTACT_PHONE`, `CONTACT_EMAIL` aur grievance officer details fill karein; legal/policy language ko apne actual return, refund, fulfilment aur legal setup ke hisaab se final review karein.

## Main API routes

- `GET /api/health` — server status
- `GET /api/products` — active products and stock
- `GET /api/cart` / `POST /api/cart/items` — browser cart
- `POST /api/orders` — Cash on Delivery order
- `POST /api/admin/login`, `POST /api/admin/logout` — admin session
- `/api/admin/products` — admin product and stock management
- `GET /api/admin/orders`, `PATCH /api/admin/orders/:id` — order list/status
- `POST /api/contact` — save a customer support message
- `GET /api/admin/messages` — admin-only contact inbox
