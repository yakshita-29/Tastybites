
require("dotenv").config();

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");

const app = express();

const PORT = process.env.PORT || 5000;
const ADMIN_KEY = process.env.ADMIN_KEY || "my-tasty-admin-123";

// CORS CONFIGURATION
const allowedOrigins = [
  "http://localhost:5173",
  "https://rad-sprinkles-bcccd6.netlify.app",
  process.env.CLIENT_ORIGIN
].filter(Boolean);

app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "x-admin-key"]
}));

app.use(express.json());

// PRODUCT MODEL
const Product = mongoose.model("Product", new mongoose.Schema({
  name: { type: String, required: true },
  price: { type: Number, required: true, min: 1 },
  category: { type: String, required: true },
  image: { type: String, default: "" },
  description: String,
  bestseller: { type: Boolean, default: false },
  available: { type: Boolean, default: true }
}, { timestamps: true }));

// ORDER MODEL
const Order = mongoose.model("Order", new mongoose.Schema({
  customer: {
    name: String,
    email: { type: String, lowercase: true },
    phone: String,
    address: String
  },
  items: [{
    productId: mongoose.Schema.Types.ObjectId,
    name: String,
    price: Number,
    quantity: Number
  }],
  subtotal: Number,
  discount: Number,
  deliveryFee: Number,
  total: Number,
  couponCode: String,
  status: {
    type: String,
    enum: ["Placed", "Preparing", "Out for delivery", "Delivered", "Cancelled"],
    default: "Placed"
  }
}, { timestamps: true }));

// COUPON MODEL
const Coupon = mongoose.model("Coupon", new mongoose.Schema({
  code: { type: String, unique: true, uppercase: true },
  type: { type: String, enum: ["percent", "fixed"] },
  value: Number,
  minOrder: { type: Number, default: 0 },
  active: { type: Boolean, default: true }
}));

// INITIAL FOOD DATA
const foodData = [
  {
    name: "Pizza",
    price: 199,
    category: "Fast Food",
    description: "Delicious cheesy pizza",
    bestseller: true
  },
  {
    name: "Burger",
    price: 99,
    category: "Fast Food",
    description: "Fresh burger with tasty toppings",
    bestseller: true
  },
  {
    name: "Pasta",
    price: 149,
    category: "Main Course",
    description: "Creamy Italian pasta",
    bestseller: false
  },
  {
    name: "Biryani",
    price: 199,
    category: "Main Course",
    description: "Aromatic spicy biryani",
    bestseller: true
  },
  {
    name: "French Fries",
    price: 89,
    category: "Fast Food",
    description: "Crispy golden fries",
    bestseller: false
  },
  {
    name: "Sandwich",
    price: 119,
    category: "Fast Food",
    description: "Fresh toasted sandwich",
    bestseller: false
  },
  {
    name: "Chocolate Cake",
    price: 149,
    category: "Desserts",
    description: "Rich chocolate cake",
    bestseller: true
  },
  {
    name: "Ice Cream",
    price: 79,
    category: "Desserts",
    description: "Cool and creamy ice cream",
    bestseller: false
  },
  {
    name: "Orange Juice",
    price: 69,
    category: "Drinks",
    description: "Fresh orange juice",
    bestseller: false
  },
  {
    name: "Coffee",
    price: 59,
    category: "Drinks",
    description: "Freshly brewed coffee",
    bestseller: false
  },
  {
    name: "Momos",
    price: 129,
    category: "Fast Food",
    description: "Steamed dumplings",
    bestseller: true
  }
];

// ADMIN MIDDLEWARE
function admin(req, res, next) {
  if (req.headers["x-admin-key"] !== ADMIN_KEY) {
    return res.status(401).json({
      message: "Invalid admin key"
    });
  }

  next();
}

// HOME
app.get("/", (req, res) => {
  res.send("Tasty Bites backend is running");
});

// HEALTH CHECK
app.get("/api/health", (req, res) => {
  res.json({
    status: "OK",
    database: mongoose.connection.readyState === 1
      ? "connected"
      : "disconnected"
  });
});

// GET PRODUCTS
app.get("/api/products", async (req, res) => {
  try {
    const products = await Product.find({
      available: true
    }).select("-image");

    res.json(products);
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});

// GET BESTSELLERS
app.get("/api/products/bestsellers", async (req, res) => {
  try {
    const products = await Product.find({
      available: true,
      bestseller: true
    }).select("-image");

    res.json(products);
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});

// VALIDATE COUPON
app.post("/api/coupons/validate", async (req, res) => {
  try {
    const code = String(req.body.code || "").toUpperCase();
    const subtotal = Number(req.body.subtotal || 0);

    const coupon = await Coupon.findOne({
      code,
      active: true
    });

    if (!coupon) {
      return res.status(404).json({
        message: "Invalid coupon"
      });
    }

    if (subtotal < coupon.minOrder) {
      return res.status(400).json({
        message: `Minimum order is ₹${coupon.minOrder}`
      });
    }

    const discount = coupon.type === "percent"
      ? Math.round(subtotal * coupon.value / 100)
      : Math.min(coupon.value, subtotal);

    res.json({ code, discount });
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});

// PLACE ORDER
app.post("/api/orders", async (req, res) => {
  try {
    const {
      name,
      email,
      phone,
      address,
      items,
      couponCode
    } = req.body;

    if (
      !name || !email || !phone || !address ||
      !Array.isArray(items) || items.length === 0
    ) {
      return res.status(400).json({
        message: "Please enter all details and add food"
      });
    }

    let subtotal = 0;
    const cleanItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);
      const quantity = Number(item.quantity);

      if (
        !product ||
        !product.available ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 50
      ) {
        return res.status(400).json({
          message: "Invalid food item or quantity"
        });
      }

      cleanItems.push({
        productId: product._id,
        name: product.name,
        price: product.price,
        quantity
      });

      subtotal += product.price * quantity;
    }

    let discount = 0;
    let usedCoupon = "";

    if (couponCode) {
      const coupon = await Coupon.findOne({
        code: String(couponCode).toUpperCase(),
        active: true
      });

      if (!coupon || subtotal < coupon.minOrder) {
        return res.status(400).json({
          message: "Invalid coupon or minimum order not reached"
        });
      }

      discount = coupon.type === "percent"
        ? Math.round(subtotal * coupon.value / 100)
        : Math.min(coupon.value, subtotal);

      usedCoupon = coupon.code;
    }

    const deliveryFee = subtotal >= 499 ? 0 : 30;
    const total = subtotal - discount + deliveryFee;

    const order = await Order.create({
      customer: {
        name,
        email: String(email).trim().toLowerCase(),
        phone,
        address
      },
      items: cleanItems,
      subtotal,
      discount,
      deliveryFee,
      total,
      couponCode: usedCoupon
    });

    res.status(201).json({
      orderId: order._id,
      total: order.total,
      status: order.status
    });
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});

// CUSTOMER ORDER HISTORY
app.get("/api/orders", async (req, res) => {
  try {
    const email = String(req.query.email || "")
      .trim()
      .toLowerCase();

    if (!email) {
      return res.status(400).json({
        message: "Email is required"
      });
    }

    const orders = await Order.find({
      "customer.email": email
    }).sort({ createdAt: -1 });

    res.json(orders);
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});

// TRACK ORDER
app.get("/api/orders/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id)) {
      return res.status(400).json({
        message: "Invalid order ID"
      });
    }

    const order = await Order.findById(req.params.id);

    if (!order) {
      return res.status(404).json({
        message: "Order not found"
      });
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});

// ADMIN ADD PRODUCT
app.post("/api/admin/products", admin, async (req, res) => {
  try {
    const product = await Product.create(req.body);
    res.status(201).json(product);
  } catch (error) {
    res.status(400).json({
      message: error.message
    });
  }
});

// ADMIN EDIT PRODUCT
app.put("/api/admin/products/:id", admin, async (req, res) => {
  try {
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );

    if (!product) {
      return res.status(404).json({
        message: "Product not found"
      });
    }

    res.json(product);
  } catch (error) {
    res.status(400).json({
      message: error.message
    });
  }
});

// ADMIN DELETE PRODUCT
app.delete("/api/admin/products/:id", admin, async (req, res) => {
  try {
    const product = await Product.findByIdAndDelete(req.params.id);

    if (!product) {
      return res.status(404).json({
        message: "Product not found"
      });
    }

    res.json({ message: "Product deleted" });
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});

// ADMIN VIEW ORDERS
app.get("/api/admin/orders", admin, async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});

// ADMIN UPDATE ORDER STATUS
app.patch("/api/admin/orders/:id/status", admin, async (req, res) => {
  try {
    const allowed = [
      "Placed",
      "Preparing",
      "Out for delivery",
      "Delivered",
      "Cancelled"
    ];

    if (!allowed.includes(req.body.status)) {
      return res.status(400).json({
        message: "Invalid status"
      });
    }

    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true }
    );

    if (!order) {
      return res.status(404).json({
        message: "Order not found"
      });
    }

    res.json(order);
  } catch (error) {
    res.status(500).json({
      message: error.message
    });
  }
});

// CONNECT DATABASE AND START SERVER
async function startServer() {
  try {
    await mongoose.connect(
      process.env.MONGO_URI ||
      "mongodb://127.0.0.1:27017/foodblog"
    );

    console.log("MongoDB connected");

    if (await Product.countDocuments() === 0) {
      await Product.insertMany(foodData);
      console.log("Food data inserted");
    }

    await Coupon.updateOne(
      { code: "WELCOME10" },
      {
        $setOnInsert: {
          code: "WELCOME10",
          type: "percent",
          value: 10,
          minOrder: 199
        }
      },
      { upsert: true }
    );

    await Coupon.updateOne(
      { code: "TASTY50" },
      {
        $setOnInsert: {
          code: "TASTY50",
          type: "fixed",
          value: 50,
          minOrder: 399
        }
      },
      { upsert: true }
    );

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error("Server startup error:", error.message);
    process.exit(1);
  }
}

startServer();
