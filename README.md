# Bella Smile — Backend

Node.js / Express / MongoDB REST API for the Bella Smile dental clinic management system.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js (ESModules) |
| Framework | Express.js |
| Database | MongoDB + Mongoose |
| Authentication | JWT (jsonwebtoken) |
| Password Hashing | bcryptjs |
| File Storage | Cloudinary |
| Payments | Stripe Checkout Sessions |
| Email | Nodemailer (Gmail) |
| Validation | Joi |
| File Upload | Multer (memoryStorage) |
| Security | Helmet, express-rate-limit |
| Compression | compression |

---

## Project Structure

```
bella-smile-backend/
├── src/
│   ├── config/
│   │   ├── env.config.js          # environment variables exports
│   │   ├── stripe.js              # Stripe instance
│   │   ├── cloudinary.js          # Cloudinary config
│   │   └── redis.js               # Redis client (optional)
│   ├── db/
│   │   ├── connection.db.js       # MongoDB connect
│   │   └── database.repository.js # generic CRUD helpers
│   ├── models/
│   │   ├── User.model.js
│   │   ├── Doctor.model.js
│   │   ├── AreaManager.model.js
│   │   ├── Distributor.model.js
│   │   ├── Patient.model.js
│   │   ├── Payment.model.js
│   │   └── StlTransfer.model.js
│   ├── middlewares/
│   │   ├── auth.middleware.js     # protect (JWT verify)
│   │   ├── role.middleware.js     # isAdmin, isAdminOrDoctor
│   │   ├── validate.middleware.js # Joi validation wrapper
│   │   └── upload.middleware.js   # multer STL upload
│   ├── modules/
│   │   ├── auth/
│   │   ├── patient/
│   │   ├── doctor/
│   │   ├── area-manager/
│   │   ├── distributor/
│   │   ├── payment/
│   │   ├── pricing/
│   │   ├── stl/
│   │   ├── dashboard/
│   │   └── contact/
│   ├── utils/
│   │   ├── ApiError.js
│   │   ├── ApiResponse.js
│   │   ├── asyncHandler.js
│   │   ├── mailer.js
│   │   ├── cloudinary.js          # uploadToCloudinary helper
│   │   ├── sendStlEmail.js
│   │   ├── stlEmailTemplate.js
│   │   └── common/
│   │       └── index.js           # all enums
│   ├── app.bootstrap.js
│   └── seed.js
├── .env
└── package.json
```

---

## Environment Variables

```env
# Server
PORT=4000
NODE_ENV=production

# Database
MONGODB_URI=mongodb+srv://...

# Client
CLIENT_URL=https://yourdomain.com


```

---

## Enums (utils/common/index.js)

### phasesEnum
```
Photographic Evaluation
Photographic Evaluation Verification
Pick Up
Preparation
Check Care Plan
Waiting for Acceptance
Completed
Not Suitable
```

### Other Enums
```
eligibilityEnum → Idoneo, Non Idoneo, null
rowColorEnum    → white, pink, yellow, purple
roleEnum        → admin, doctor
statusEnum      → pending, succeeded, failed, refunded
```

---

## Models

### User
| Field | Type | Notes |
|---|---|---|
| name | String | required |
| email | String | unique, lowercase |
| password | String | bcrypt hashed, select:false |
| role | Enum | admin / doctor |
| isActive | Boolean | default true |
| mustChangePassword | Boolean | default false |
| passwordResetToken | String | select:false |
| passwordResetExpires | Date | select:false |

**Hooks:** `pre("save")` → bcrypt hash password  
**Methods:** `comparePassword()`, `toSafeObject()`

---

### Doctor
| Field | Type | Notes |
|---|---|---|
| user | ObjectId ref User | required |
| firstName, lastName | String | |
| email, phone, city, agency | String | |
| deposit | Number | |
| paymentExempt | Boolean | default false |
| paymentExemptGrantedBy | ObjectId ref User | audit |
| paymentExemptGrantedAt | Date | audit |
| areaManager | ObjectId ref AreaManager | |
| distributor | ObjectId ref Distributor | |

---

### Patient
| Field | Type | Notes |
|---|---|---|
| doctor | ObjectId ref Doctor | required |
| firstName, lastName | String | required |
| nationality | String | |
| flagUrgent, flagQuestion, flagStar | Boolean | !, ?, * |
| sconto, priority | Boolean | |
| treatment | Enum | treatmentEnum |
| currentPhase | Enum | phasesEnum |
| eligibility | Enum | eligibilityEnum |
| rowColor | Enum | rowColorEnum |
| dataPronte | Date | |
| acceptanceDecision | Enum | pending/stl/manufacturing |
| phaseHistory[] | Embedded | phase, changedBy, notes, changedAt |
| documents[] | Embedded | fileName, url, publicId, category... |
| management{} | Embedded | treatment info |
| lavorazioni[] | Embedded | processing rows |
| activityLog[] | Embedded | action, user, userName, createdAt |
| notes[] | Embedded | message, sentBy, sentByRole |
| isActive | Boolean | soft delete |

**numAligners Logic:**
- Set optionally on create
- Set optionally in suitabilityAndPickUp
- Auto-updated when management is saved (sup + inf)
- Auto-updated when care plan is saved (sup + inf)


---

### Pricing
| Field | Type | Notes |
|---|---|---|
| pricePerAligner | Number | min 1 |
| currency | Enum | eur/usd/gbp |
| updatedBy | ObjectId ref User | |
| note | String | reason for change |
| isActive | Boolean | only one active at a time |

History is kept — new record on each update, old ones deactivated.

---

## API Routes

### Auth — `/api/auth`
```
POST   /register                    Admin only
POST   /login
GET    /me                          Protected
PATCH  /change-password             Protected
POST   /forgot-password
POST   /reset-password/:token
PATCH  /users/:userId/role          Admin only
```

### Patients — `/api/patients`
```
GET    /                            Admin + Doctor
POST   /                            Admin + Doctor
GET    /:id                         Admin + Doctor
PUT    /:id                         Admin + Doctor
DELETE /:id                         Admin only

PATCH  /:id/phase                   Admin only (manual override)
PATCH  /:id/acceptance-decision     Admin + Doctor

POST   /:id/verifica-valutazione    Admin + Doctor
POST   /:id/suitability-pickup      Admin + Doctor
POST   /:id/Preparation             Admin + Doctor
POST   /:id/check-care-plan         Admin + Doctor
POST   /:id/waiting-for-acceptance  Admin + Doctor
POST   /:id/completed               Admin + Doctor

POST   /:id/documents               Admin + Doctor (multipart)
DELETE /:id/documents/:documentId   Admin + Doctor

PUT    /:id/management              Admin + Doctor
PUT    /:id/care-plan               Admin only

POST   /:id/lavorazioni             Admin only
PUT    /:id/lavorazioni/:lavId      Admin only
DELETE /:id/lavorazioni/:lavId      Admin only

GET    /:id/activity-log            Admin + Doctor
POST   /:id/notes                   Admin + Doctor
GET    /:id/notes                   Admin + Doctor
```

### Pricing — `/api/pricing`
```
GET    /                            Admin + Doctor
PUT    /                            Admin only
GET    /history                     Admin only
```

### STL — `/api/stl`
```
POST   /send                        Admin only (multipart)
GET    /patient/:patientId          Admin only
```

### Dashboard — `/api/dashboard`
```
GET    /stats                       Admin + Doctor
```

### Other
```
GET    /api/doctors
GET    /api/area-managers
GET    /api/distributors
POST   /api/contact
```

---

## Patient Workflow

```
Photographic Evaluation
        ↓  verifica-valutazione
Photographic Evaluation Verification
        ↓  suitability-pickup
        │  (eligibility + treatment + dataPronte)
        ├─ Non Idoneo → Not Suitable (end)
        └─ Idoneo ↓
Pick Up
        ↓  Preparation
        │  Doctor: requires payment OR paymentExempt=true
        │  Admin:  direct transition
Preparation
        ↓  check-care-plan
Check Care Plan
        ↓  waiting-for-acceptance
Waiting for Acceptance
        ↓  completed
Completed
```

---

**Payment Reset:** When Admin moves patient back before Pick Up:
```javascript
Payment.updateMany(
  { patient: id, status: { $in: ["pending", "succeeded"] } },
  { $set: { status: "refunded", phaseUnlocked: false } }
)
```

---

## Running Locally

```bash
# Install
npm install

# Seed admin user
node src/seed.js

# Development
npm run dev

# Stripe webhook (separate terminal)
stripe listen --forward-to localhost:4000/api/payments/webhook
```

---

## Production Checklist

```
☐ NODE_ENV=production in .env
☐ Strong JWT_SECRET (min 32 chars random)
☐ STRIPE_SECRET_KEY=sk_live_xxx (not test)
☐ STRIPE_WEBHOOK_SECRET from Stripe Dashboard
☐ MongoDB Atlas connection string
☐ Cloudinary credentials
☐ Gmail App Password (not regular password)
☐ CLIENT_URL points to production domain
☐ PAYMENT_SUCCESS_PATH and PAYMENT_CANCEL_PATH updated
```