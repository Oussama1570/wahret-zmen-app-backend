const Order = require("./order.model");
const Product = require("../products/product.model.js");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");


// ✅ Create a New Order
const createAOrder = async (req, res) => {
  try {
    console.log("📦 Incoming order request:", JSON.stringify(req.body, null, 2));

    const products = await Promise.all(
      req.body.products.map(async (product) => {
        const productData = await Product.findById(product.productId);

        if (!productData) {
          throw new Error(`❌ Product not found: ${product.productId}`);
        }

        // 🛡️ Ensure color is a valid multilingual object
        const isMultilingualColor =
          product?.color?.colorName &&
          typeof product.color.colorName === "object" &&
          product.color.colorName.en &&
          product.color.colorName.fr &&
          product.color.colorName.ar;

        const selectedColor = isMultilingualColor
          ? product.color
          : {
              colorName: {
                en:
                  product.color?.colorName?.en ||
                  product.color?.colorName ||
                  "Original",
                fr:
                  product.color?.colorName?.fr ||
                  product.color?.colorName ||
                  "Original",
                ar:
                  product.color?.colorName?.ar ||
                  "أصلي",
              },
              image:
                product.color?.image ||
                product.coverImage ||
                productData.coverImage,
            };

        return {
          productId: product.productId,
          quantity: product.quantity,
          color: selectedColor,
        };
      })
    );

    const newOrder = new Order({
      ...req.body,
      products,
    });

    const savedOrder = await newOrder.save();
    console.log("✅ Order saved:", savedOrder._id);
    res.status(200).json(savedOrder);
  } catch (error) {
    console.error("❌ Error creating order:", error);
    res.status(500).json({
      message: error.message || "Failed to create order",
    });
  }
};



// ✅ Get Orders by Customer Email
const getOrderByEmail = async (req, res) => {
  try {
    const { email } = req.params;
    const orders = await Order.find({ email })
      .sort({ createdAt: -1 })
      .populate("products.productId", "title colors coverImage");

    if (!orders || orders.length === 0) {
      return res.status(404).json({ message: "No orders found" });
    }
    res.status(200).json(orders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

// ✅ Get a single order by ID
const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id).populate("products.productId", "title colors coverImage");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.status(200).json(order);
  } catch (error) {
    console.error("Error fetching order by ID:", error);
    res.status(500).json({ message: "Failed to fetch order by ID" });
  }
};


// ✅ Get All Orders (Admin)
const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("products.productId", "title colors coverImage")
      .lean();

    const processedOrders = orders.map(order => ({
      ...order,
      products: order.products.map(product => ({
        ...product,
        coverImage: product.productId?.coverImage || "/assets/default-image.png",
      })),
    }));

    res.status(200).json(processedOrders);
  } catch (error) {
    console.error("Error fetching orders:", error);
    res.status(500).json({ message: "Failed to fetch orders" });
  }
};

// ✅ Update an Order
const updateOrder = async (req, res) => {
  const { id } = req.params;
  const { isPaid, isDelivered, productProgress } = req.body;

  try {
    const updatedOrder = await Order.findByIdAndUpdate(
      id,
      {
        isPaid,
        isDelivered,
        productProgress: productProgress || {}, // ✅ Ensure only productProgress is updated
      },
      { new: true }
    );

    if (!updatedOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.status(200).json(updatedOrder);
  } catch (error) {
    console.error("Error updating order:", error);
    res.status(500).json({ message: "Failed to update order" });
  }
};


// ✅ Delete an Order
const deleteOrder = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedOrder = await Order.findByIdAndDelete(id);

    if (!deletedOrder) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.status(200).json({ message: "Order deleted successfully", deletedOrder });
  } catch (error) {
    console.error("Error deleting order:", error);
    res.status(500).json({ message: "Failed to delete order" });
  }
};



// ✅ Remove a Product from an Order
const removeProductFromOrder = async (req, res) => {
  const { orderId, productKey, quantityToRemove } = req.body;

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const [productId, colorName] = productKey.split("|");

    let productFound = false;
    const updatedProducts = order.products.reduce((acc, item) => {
      const matchesProductId = item.productId.toString() === productId;
      const matchesColorName = typeof item.color?.colorName === "string"
        ? item.color.colorName === colorName
        : Object.values(item.color?.colorName || {}).includes(colorName);

      if (!matchesProductId || !matchesColorName) {
        acc.push(item); // keep
      } else {
        productFound = true;

        if (item.quantity < quantityToRemove) {
          throw new Error("Cannot remove more than existing quantity");
        }

        const newQty = item.quantity - quantityToRemove;
        if (newQty > 0) {
          acc.push({ ...item.toObject(), quantity: newQty });
        }
      }
      return acc;
    }, []);

    if (!productFound) {
      return res.status(404).json({ message: "Product not found in order" });
    }

    const allProductDetails = await Product.find({
      _id: { $in: updatedProducts.map((p) => p.productId) },
    });

    const newTotal = updatedProducts.reduce((acc, item) => {
      const prod = allProductDetails.find((p) => p._id.toString() === item.productId.toString());
      const price = prod?.newPrice || 0;
      return acc + price * item.quantity;
    }, 0);

    order.products = updatedProducts;
    order.totalPrice = newTotal;
    await order.save();

    res.status(200).json({ message: "Product updated successfully" });
  } catch (error) {
    console.error("❌ Error updating order:", error);
    res.status(500).json({ message: error.message || "Failed to update order" });
  }
};


// ✅ Send Order Notification via Email
const sendOrderNotification = async (req, res) => {
  try {
    const { orderId, email, productKey, progress, articleIndex } = req.body;

    console.log("📩 Incoming Notification Request:", req.body);

    if (!email || !productKey || progress === undefined) {
      return res
        .status(400)
        .json({ message: "Missing email, productKey, or progress value" });
    }

    const order = await Order.findById(orderId).populate(
      "products.productId",
      "title colors coverImage"
    );

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const customerName = order.name;
    const shortOrderId = String(order._id).slice(0, 8);
    const [productId, colorName] = productKey.split("|");

    const matchedProduct = order.products.find(
      (p) =>
        p.productId?._id?.toString() === productId &&
        (p.color?.colorName === colorName ||
          p.color?.colorName?.en === colorName ||
          p.color?.colorName?.fr === colorName ||
          p.color?.colorName?.ar === colorName)
    );

    if (!matchedProduct) {
      return res.status(404).json({ message: "Product not found in order" });
    }

    const articleText = articleIndex ? ` (Article #${articleIndex})` : "";
    const articleTextAr = articleIndex ? ` (المقالة رقم ${articleIndex})` : "";

    const subject =
      progress === 100
        ? `Commande ${shortOrderId}${articleText} – Votre création est prête !`
        : `Commande ${shortOrderId}${articleText} – Suivi de la confection artisanale (${progress}%)`;

    const htmlMessage = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6;">
        <!-- French Message -->
        <p><strong>Cher ${customerName}</strong>,</p>
        <p>
          Nous avons le plaisir de vous informer que la création artisanale que notre atelier est en train de confectionner pour vous –
          <strong>${matchedProduct.productId.title}</strong> (Couleur : <strong>${colorName}</strong>)${articleText}, 
          dans la <strong>commande n°${shortOrderId}</strong> – 
          est actuellement <strong>terminée à ${progress}%</strong>.
        </p>
        ${
          progress === 100
            ? `<p><strong>Bonne nouvelle !</strong> Votre article est maintenant <strong>entièrement terminé</strong> et est <strong>prêt pour la livraison ou le retrait en boutique</strong>.</p>`
            : `<p>Nous vous tiendrons informé dès que l'article sera entièrement terminé et prêt.</p>`
        }
        <p>Merci pour votre confiance,<br/><strong>L’équipe Wahret Zmen</strong></p>

        <hr style="margin: 2rem 0;" />

        <!-- Arabic Message -->
        <p dir="rtl"><strong>عزيزي ${customerName}</strong>،</p>
        <p dir="rtl">
          يسرنا أن نبلغك أن القطعة الحرفية التي نقوم بتفصيلها لك في ورشتنا –
          <strong>${matchedProduct.productId.title}</strong> (اللون: <strong>${colorName}</strong>)${articleTextAr}،
          ضمن <strong>الطلب رقم ${shortOrderId}</strong> – 
          وصلت حاليًا إلى <strong>${progress}٪</strong> من مرحلة الإنجاز.
        </p>
        ${
          progress === 100
            ? `<p dir="rtl"><strong>خبر سار!</strong> لقد اكتملت القطعة بالكامل، وهي <strong>جاهزة للتسليم أو الاستلام من المتجر</strong>.</p>`
            : `<p dir="rtl">سنقوم بإبلاغك فور الانتهاء الكامل من تفصيل القطعة وتجهيزها.</p>`
        }
        <p dir="rtl">شكراً لثقتك بنا،<br/><strong>فريق وهرة الزمن</strong></p>
      </div>
    `;

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject,
      html: htmlMessage,
    };

    await transporter.sendMail(mailOptions);

    res
      .status(200)
      .json({ message: "Notification sent successfully in French and Arabic." });
  } catch (error) {
    console.error("Error sending notification:", error);
    res
      .status(500)
      .json({ message: "Error sending notification", error: error.message });
  }
};




module.exports = {
  createAOrder,
  getAllOrders,
  getOrderByEmail,
  getOrderById,
  updateOrder,
  deleteOrder,
  sendOrderNotification,
  removeProductFromOrder, // ✅ must be exported
};

