const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config();

const app = express();
const port = process.env.PORT || 5000;

// ✅ Include the correct frontend domain(s) here
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(",")
  : [
    "http://localhost:5173",
      "https://wahret-zmen-app-frontend-six.vercel.app",
      
    ];

// ✅ CORS setup
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ✅ Routes
app.use("/api/products", require("./src/products/product.route"));
app.use("/api/orders", require("./src/orders/order.route"));
app.use("/api/auth", require("./src/users/user.route"));
app.use("/api/admin", require("./src/stats/admin.stats"));
app.use("/api", require("./src/routes/uploadRoutes"));
app.use("/api/contact", require("./src/contact-form/contact-form.route"));

// ✅ MongoDB connection
const connectDB = async () => {
  try {
    await mongoose.connect(process.env.DB_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });
    console.log("✅ MongoDB connected successfully");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    setTimeout(connectDB, 5000);
  }
};

connectDB();

// ✅ Root route
app.get("/", (req, res) => {
  res.send("Wahret Zmen Boutique Server is running!");
});

app.listen(port, () => {
  console.log(`🚀 Server running on port ${port}`);
});
