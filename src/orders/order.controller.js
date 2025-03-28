const Order = require("./order.model");
const Product = require("../products/product.model.js");
const nodemailer = require("nodemailer");
const mongoose = require("mongoose");


// ✅ Create a New Order
const createAOrder = async (req, res) => {
  try {
    const products = await Promise.all(
      req.body.products.map(async (product) => {
        const productData = await Product.findById(product.productId);

        if (!productData) {
          throw new Error(`Product not found: ${product.productId}`);
        }

        const selectedColor = product.color?.colorName
          ? product.color
          : productData.colors[0] || { colorName: "Default", image: productData.coverImage };

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
    res.status(200).json(savedOrder);
  } catch (error) {
    console.error("Error creating order:", error);
    res.status(500).json({ message: error.message || "Failed to create order" });
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





const removeProductFromOrder = async (req, res) => {
  const { orderId, productKey, quantityToRemove } = req.body;

  try {
    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const [productId, colorName] = productKey.split("|");

    // 🧠 Update product quantity or remove if quantity reaches 0
    let productFound = false;
const updatedProducts = order.products.reduce((acc, item) => {
  const isMatch = item.productId.toString() === productId && item.color.colorName === colorName;

  if (!isMatch) {
    acc.push(item); // keep others
  } else {
    productFound = true;

    if (item.quantity < quantityToRemove) {
      throw new Error("Cannot remove more than existing quantity");
    }

    const newQty = item.quantity - quantityToRemove;

    if (newQty > 0) {
      acc.push({ ...item.toObject(), quantity: newQty }); // reduce quantity
    }
    // else: don’t push → remove product
  }

  return acc;
}, []);

if (!productFound) {
  return res.status(404).json({ message: "Product not found in order" });
}


    // 🧮 Recalculate total price (optional but recommended)
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
    res.status(500).json({ message: "Failed to update order" });
  }
};



// ✅ Send Order Notification via Email
const sendOrderNotification = async (req, res) => {
  try {
    const { orderId, email, productKey, progress } = req.body;

    console.log("📩 Incoming Notification Request:", req.body);

    if (!email || !productKey || progress === undefined) {
      return res.status(400).json({ message: "Missing email, productKey, or progress value" });
    }

    const order = await Order.findById(orderId).populate("products.productId", "title colors coverImage");
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const customerName = order.name;
    const [productId, colorName] = productKey.split("|");

    const matchedProduct = order.products.find(
      (p) => p.productId?._id?.toString() === productId && p.color?.colorName === colorName
    );

    if (!matchedProduct) {
      return res.status(404).json({ message: "Product not found in order" });
    }

    const subject = progress === 100 ? 
      `Wahret Zmen - Votre création est prête à être récupérée !` : 
      `Wahret Zmen - Suivi de votre création (${progress}%)`;

      const htmlMessage = `
      <div>
        <!-- French Message -->
        <p><strong>Cher ${customerName}</strong>,</p>
        <p>
          Nous avons le plaisir de vous informer que votre création artisanale <strong>${matchedProduct.productId.title}</strong>
          (Couleur : ${matchedProduct.color.colorName}) est actuellement <strong>${progress}% confectionnée</strong> par notre atelier Wahret Zmen.
        </p>
        ${progress === 100 ? 
          `<p><strong>Bonne nouvelle !</strong> Votre création est maintenant <strong>entièrement terminée</strong> et est <strong>prête pour la livraison ou le retrait en boutique</strong> chez Wahret Zmen.</p>` : 
          `<p>Nous vous tiendrons informé dès qu'elle sera entièrement finalisée et prête à être récupérée ou livrée.</p>`
        }
        <p>Merci pour votre confiance,<br/>L’équipe Wahret Zmen</p>
    
        <hr/>
    
        <!-- Arabic Message -->
        <p dir="rtl"><strong>عزيزي ${customerName}،</strong></p>
        <p dir="rtl">
          يسعدنا إعلامك بأن إبداعك التقليدي <strong>${matchedProduct.productId.title}</strong>
          (اللون: <strong>${matchedProduct.color.colorName}</strong>)
          تتم حياكته حاليًا بنسبة <strong>${progress}٪</strong> في ورشة وهرة الزمن.
        </p>
        ${progress === 100 ? 
          `<p dir="rtl"><strong>أخبار سارة!</strong> لقد تم الانتهاء من إبداعك بالكامل، وهو <strong>جاهز للتوصيل أو الاستلام من متجر وهرة الزمن</strong>.</p>` : 
          `<p dir="rtl">سنعلمك فور اكتمالها وجاهزيتها للتوصيل أو الاستلام.</p>`
        }
        <p dir="rtl">شكراً لثقتك بنا،<br/>فريق وهرة الزمن</p>
      </div>
    `;a

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

    res.status(200).json({ message: "Notification sent successfully in French and Arabic." });
  } catch (error) {
    console.error("Error sending notification:", error);
    res.status(500).json({ message: "Error sending notification", error: error.message });
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

