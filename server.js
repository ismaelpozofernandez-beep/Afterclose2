const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const { v2: cloudinary } = require("cloudinary");

require("dotenv").config();

const app = express();
const PORT = Number(process.env.API_PORT || process.env.PORT) || 3000;
const MONGO_URI = process.env.MONGO_URI;
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || "gpt-5-mini";
const OPENAI_IMAGE_MODEL = process.env.OPENAI_IMAGE_MODEL || "gpt-image-1-mini";
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 80 * 1024 * 1024 } });

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

app.use(cors());
app.use(express.json());

if (!MONGO_URI) {
  console.warn("Falta MONGO_URI. Copia .env.example a .env y rellena la conexion.");
} else {
  mongoose
    .connect(MONGO_URI, {
      serverSelectionTimeoutMS: 5000,
      family: 4,
    })
    .then(() => {
      console.log("Mongo conectado");
    })
    .catch((err) => {
      console.log("Error Mongo:", err.message);
    });
}

const userSchema = new mongoose.Schema(
  {
    username: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true },
    bio: { type: String, default: "" },
    company: { type: String, default: "" },
    avatarUrl: { type: String, default: "" },
    location: { type: String, default: "" },
    sector: { type: String, default: "" },
    website: { type: String, default: "" },
    liveStatus: { type: String, default: "Disponible" },
    reputation: { type: Number, default: 0 },
    followingUsers: [{ type: String, trim: true }],
    followingCompanies: [{ type: String, trim: true }],
    blockedUsers: [{ type: String, trim: true }],
    savedPosts: [{ type: mongoose.Schema.Types.ObjectId, ref: "Post" }],
  },
  { timestamps: true }
);

const postSchema = new mongoose.Schema({
  user: { type: String, required: true, trim: true },
  text: { type: String, required: true, trim: true },
  company: { type: String, default: "AfterClose", trim: true },
  intent: { type: String, default: "momento", trim: true },
  city: { type: String, default: "", trim: true },
  visibilityTier: { type: String, default: "local", trim: true },
  negotiable: { type: Boolean, default: false },
  mediaType: { type: String, enum: ["text", "photo", "video"], default: "text" },
  imageUri: { type: String, default: "" },
  mediaUrl: { type: String, default: "" },
  cloudinaryPublicId: { type: String, default: "" },
  savedBy: [{ type: String, trim: true }],
  reports: [
    {
      user: { type: String, trim: true },
      reason: { type: String, default: "Contenido inapropiado" },
      createdAt: { type: Date, default: Date.now },
    },
  ],
  hidden: { type: Boolean, default: false },
  mentions: [{ type: String, trim: true }],
  hashtags: [{ type: String, trim: true }],
  comments: [
    {
      user: { type: String, required: true, trim: true },
      text: { type: String, required: true, trim: true },
      intent: { type: String, default: "comentario", trim: true },
      replies: [
        {
          user: { type: String, required: true, trim: true },
          text: { type: String, required: true, trim: true },
          intent: { type: String, default: "respuesta", trim: true },
          createdAt: { type: Date, default: Date.now },
        },
      ],
      createdAt: { type: Date, default: Date.now },
    },
  ],
  likes: { type: Number, default: 0 },
  shares: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", userSchema);
const Post = mongoose.model("Post", postSchema);

const notificationSchema = new mongoose.Schema({
  user: { type: String, required: true, trim: true },
  actor: { type: String, required: true, trim: true },
  type: { type: String, required: true },
  text: { type: String, default: "" },
  postId: { type: mongoose.Schema.Types.ObjectId, ref: "Post" },
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

const Notification = mongoose.model("Notification", notificationSchema);

const chatSchema = new mongoose.Schema({
  participants: [{ type: String, required: true, trim: true }],
  messages: [
    {
      from: { type: String, required: true, trim: true },
      to: { type: String, required: true, trim: true },
      text: { type: String, required: true, trim: true },
      read: { type: Boolean, default: false },
      createdAt: { type: Date, default: Date.now },
    },
  ],
  lastMessage: { type: String, default: "" },
  lastMessageAt: { type: Date, default: Date.now },
}, { timestamps: true });

chatSchema.index({ participants: 1 });
chatSchema.index({ lastMessageAt: -1 });

const Chat = mongoose.model("Chat", chatSchema);

app.get("/", (_req, res) => {
  res.json({ ok: true, app: "AfterClose API" });
});

app.get("/healthz", (_req, res) => {
  res.json({ ok: true, app: "AfterClose API", status: "healthy" });
});

app.post("/upload-media", upload.single("media"), async (req, res) => {
  try {
    if (!isCloudinaryConfigured()) {
      return res.status(500).json({ error: "Cloudinary no esta configurado en .env" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Falta el archivo media" });
    }

    const resourceType = req.file.mimetype.startsWith("video/") ? "video" : "image";
    const dataUri = `data:${req.file.mimetype};base64,${req.file.buffer.toString("base64")}`;
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: "afterclose",
      resource_type: resourceType,
    });

    res.status(201).json({
      mediaUrl: result.secure_url,
      mediaType: resourceType === "video" ? "video" : "photo",
      publicId: result.public_id,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/register", async (req, res) => {
  try {
    const { username, password, company } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: "username y password son obligatorios" });
    }

    const exists = await User.findOne({ username });
    if (exists) return res.status(409).json({ error: "Usuario ya existe" });

    const hash = await bcrypt.hash(password, 10);
    const user = new User({ username, password: hash, company: company || "" });

    await user.save();

    res.status(201).json({ msg: "Usuario creado", username: user.username });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    const user = await User.findOne({ username });

    if (!user) return res.status(404).json({ error: "Usuario no existe" });

    const ok = await bcrypt.compare(password, user.password);

    if (!ok) return res.status(401).json({ error: "Password incorrecta" });

    const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, {
      expiresIn: "7d",
    });

    res.json({
      token,
      username: user.username,
      company: user.company,
      bio: user.bio,
      avatarUrl: user.avatarUrl,
      location: user.location,
      sector: user.sector,
      website: user.website,
      liveStatus: user.liveStatus,
      reputation: user.reputation,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

async function createPost(req, res) {
  try {
    const { user, text, url, company, mediaType, imageUri, mediaUrl, cloudinaryPublicId, intent, city, negotiable, expiresInHours } = req.body;
    const postText = text || url || "Nueva foto";

    if (!user || !postText) {
      return res.status(400).json({ error: "user y text son obligatorios" });
    }

    const post = new Post({
      user,
      text: postText,
      company: company || "AfterClose",
      intent: intent || "momento",
      city: city || "",
      negotiable: Boolean(negotiable),
      mediaType: mediaType || (mediaUrl || imageUri ? "photo" : "text"),
      imageUri: imageUri || "",
      mediaUrl: mediaUrl || "",
      cloudinaryPublicId: cloudinaryPublicId || "",
      mentions: extractMentions(postText),
      hashtags: extractHashtags(postText),
      visibilityTier: getVisibilityTier(0),
    });

    await post.save();

    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

app.post("/post", createPost);
app.post("/upload", createPost);

app.get("/feed", async (_req, res) => {
  try {
    const posts = await Post.find({ hidden: false }).sort({ likes: -1, shares: -1, createdAt: -1 });
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/like/:id", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) return res.status(404).json({ error: "No existe post" });

    post.likes += 1;

    await post.save();
    await notify(post.user, req.body.user || "Alguien", "like", "Le ha gustado tu publicacion", post._id);

    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/comment/:id", async (req, res) => {
  try {
    const { user, text, intent } = req.body;
    const post = await Post.findById(req.params.id);

    if (!post) return res.status(404).json({ error: "No existe post" });
    if (!user || !text) return res.status(400).json({ error: "user y text son obligatorios" });

    post.comments.push({ user, text, intent: intent || "comentario" });
    await post.save();
    await notify(post.user, user, "comment", text, post._id);

    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/comment/:postId/:commentIndex/reply", async (req, res) => {
  try {
    const { user, text, intent } = req.body;
    const post = await Post.findById(req.params.postId);
    const comment = post?.comments[Number(req.params.commentIndex)];

    if (!post || !comment) return res.status(404).json({ error: "No existe comentario" });
    if (!user || !text) return res.status(400).json({ error: "user y text son obligatorios" });

    comment.replies.push({ user, text, intent: intent || "respuesta" });
    await post.save();
    await notify(comment.user, user, "reply", text, post._id);

    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/share/:id", async (req, res) => {
  try {
    const post = await Post.findById(req.params.id);

    if (!post) return res.status(404).json({ error: "No existe post" });

    post.shares += 1;
    await post.save();

    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    const normalized = q.replace(/^[@#]/, "");
    const safeQuery = escapeRegExp(normalized);
    const regex = new RegExp(safeQuery, "i");
    const filter = q
      ? {
          $or: [
            { user: regex },
            { company: regex },
            { text: regex },
            { mentions: regex },
            { hashtags: regex },
            { intent: regex },
            { city: regex },
          ],
        }
      : {};

    const posts = await Post.find(filter).sort({ createdAt: -1 }).limit(30);
    const matchedUsers = q
      ? await User.find({
          $or: [{ username: regex }, { company: regex }, { sector: regex }, { location: regex }],
        })
          .select("username company sector location")
          .limit(20)
      : [];

    const userNames = new Set([...posts.map((post) => post.user), ...matchedUsers.map((profile) => profile.username)]);
    const users = [...userNames].map((name) => {
      const profile = matchedUsers.find((item) => item.username === name);
      const count = posts.filter((post) => post.user === name).length;
      return {
        type: "perfil",
        name,
        subtitle: profile?.sector || profile?.company || `${count} publicaciones`,
      };
    });
    const companies = [...new Set(posts.map((post) => post.company).filter(Boolean))].map((name) => ({
      type: "empresa",
      name,
      subtitle: `${posts.filter((post) => post.company === name).length} menciones`,
    }));
    const hashtags = [...new Set(posts.flatMap((post) => post.hashtags || []))].map((name) => ({
      type: "hashtag",
      name: `#${name}`,
      subtitle: `${posts.filter((post) => post.hashtags?.includes(name)).length} publicaciones`,
    }));

    res.json({ users, companies, hashtags, posts });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


app.get("/activity", async (_req, res) => {
  try {
    const posts = await Post.find({ hidden: false }).sort({ createdAt: -1 }).limit(200);
    const zones = [...posts.reduce((map, post) => {
      const key = post.city || post.company || "AfterClose";
      const current = map.get(key) || { name: key, posts: 0, likes: 0, intent: post.intent || "momento" };
      current.posts += 1;
      current.likes += post.likes || 0;
      map.set(key, current);
      return map;
    }, new Map()).values()].sort((a, b) => b.likes - a.likes || b.posts - a.posts).slice(0, 12);

    const circles = [...posts.reduce((map, post) => {
      (post.hashtags || []).forEach((tag) => {
        const key = `${post.city || "Global"} #${tag}`;
        const current = map.get(key) || { name: key, posts: 0, expiresIn: "24h" };
        current.posts += 1;
        map.set(key, current);
      });
      return map;
    }, new Map()).values()].sort((a, b) => b.posts - a.posts).slice(0, 12);

    res.json({ zones, circles });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get("/profile/:user", async (req, res) => {
  try {
    const profile = await User.findOne({ username: req.params.user }).select("-password");
    const posts = await Post.find({ user: req.params.user, hidden: false }).sort({ createdAt: -1 });
    const likes = posts.reduce((sum, post) => sum + post.likes, 0);
    const shares = posts.reduce((sum, post) => sum + post.shares, 0);

    res.json({
      user: req.params.user,
      profile,
      posts,
      stats: {
        posts: posts.length,
        likes,
        shares,
        following: profile?.followingUsers?.length || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/profile/:user", async (req, res) => {
  try {
    const { bio, company, avatarUrl, location, sector, website, liveStatus } = req.body;
    const profile = await User.findOneAndUpdate(
      { username: req.params.user },
      { $set: { bio: bio || "", company: company || "", avatarUrl: avatarUrl || "", location: location || "", sector: sector || "", website: website || "", liveStatus: liveStatus || "Disponible" } },
      { new: true }
    ).select("-password");

    if (!profile) return res.status(404).json({ error: "Usuario no existe" });

    res.json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/follow", async (req, res) => {
  try {
    const { user, target, type } = req.body;
    const field = type === "empresa" ? "followingCompanies" : "followingUsers";
    const profile = await User.findOne({ username: user });

    if (!profile || !target) return res.status(404).json({ error: "Perfil no encontrado" });

    const isFollowing = profile[field].includes(target);
    profile[field] = isFollowing ? profile[field].filter((item) => item !== target) : [...profile[field], target];
    await profile.save();
    if (!isFollowing && field === "followingUsers") {
      await notify(target, user, "follow", "Ha empezado a seguirte");
    }

    res.json({ following: !isFollowing, profile });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/save/:id", async (req, res) => {
  try {
    const { user } = req.body;
    const post = await Post.findById(req.params.id);

    if (!post || !user) return res.status(404).json({ error: "No existe post" });

    post.savedBy = post.savedBy.includes(user)
      ? post.savedBy.filter((item) => item !== user)
      : [...post.savedBy, user];
    await post.save();

    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.patch("/post/:id", async (req, res) => {
  try {
    const { user, text } = req.body;
    const post = await Post.findById(req.params.id);

    if (!post) return res.status(404).json({ error: "No existe post" });
    if (post.user !== user) return res.status(403).json({ error: "Solo puedes editar tus publicaciones" });

    post.text = text || post.text;
    post.mentions = extractMentions(post.text);
    post.hashtags = extractHashtags(post.text);
    post.visibilityTier = getVisibilityTier(post.likes);
    await post.save();

    res.json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/post/:id", async (req, res) => {
  try {
    const { user } = req.body;
    const post = await Post.findById(req.params.id);

    if (!post) return res.status(404).json({ error: "No existe post" });
    if (post.user !== user) return res.status(403).json({ error: "Solo puedes borrar tus publicaciones" });

    post.hidden = true;
    await post.save();

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/report/:id", async (req, res) => {
  try {
    const { user, reason } = req.body;
    const post = await Post.findById(req.params.id);

    if (!post) return res.status(404).json({ error: "No existe post" });

    post.reports.push({ user: user || "anonimo", reason: reason || "Contenido inapropiado" });
    await post.save();

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/block", async (req, res) => {
  try {
    const { user, target } = req.body;
    const profile = await User.findOne({ username: user });

    if (!profile || !target) return res.status(404).json({ error: "Perfil no encontrado" });

    if (!profile.blockedUsers.includes(target)) profile.blockedUsers.push(target);
    await profile.save();

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/notifications/:user", async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.params.user }).sort({ createdAt: -1 }).limit(50);
    res.json(notifications);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/chats/:user", async (req, res) => {
  try {
    const username = String(req.params.user || "").trim();
    const chats = await Chat.find({ participants: username }).sort({ lastMessageAt: -1 }).limit(50);
    const payload = chats.map((chat) => {
      const otherUser = chat.participants.find((participant) => participant !== username) || username;
      const unread = chat.messages.filter((message) => message.to === username && !message.read).length;
      return {
        _id: chat._id,
        user: otherUser,
        lastMessage: chat.lastMessage,
        lastMessageAt: chat.lastMessageAt,
        unread,
        messages: chat.messages.slice(-1),
      };
    });

    res.json(payload);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/chat/:user/:target", async (req, res) => {
  try {
    const participants = normalizeChatParticipants(req.params.user, req.params.target);
    if (!participants) return res.status(400).json({ error: "Usuarios de chat no validos" });

    const chat = await Chat.findOne({ participants: { $all: participants, $size: 2 } });
    if (!chat) return res.json({ participants, messages: [] });

    chat.messages.forEach((message) => {
      if (message.to === req.params.user) message.read = true;
    });
    await chat.save();

    res.json(chat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/chat/message", async (req, res) => {
  try {
    const { from, to, text } = req.body;
    const participants = normalizeChatParticipants(from, to);
    const messageText = String(text || "").trim();

    if (!participants || !messageText) {
      return res.status(400).json({ error: "from, to y text son obligatorios" });
    }

    let chat = await Chat.findOne({ participants: { $all: participants, $size: 2 } });
    if (!chat) chat = new Chat({ participants, messages: [] });

    chat.messages.push({ from, to, text: messageText });
    chat.lastMessage = messageText;
    chat.lastMessageAt = new Date();
    await chat.save();
    await notify(to, from, "chat", messageText);

    res.status(201).json(chat);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/ai/comment", async (req, res) => {
  try {
    const { text, tone } = req.body;
    const comment = await generateSocialText({
      fallback: randomItem(AI_COMMENTS),
      prompt: `Escribe un comentario corto, natural y humano en espanol para esta publicacion. Tono: ${tone || "cercano y profesional"}. Publicacion: "${String(text || "").slice(0, 500)}"`,
    });

    res.json({ text: cleanGeneratedText(comment, 180) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/ai/post", async (req, res) => {
  try {
    const post = await createAIPost(req.body || {});
    res.status(201).json(post);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/ai/social-pulse", async (req, res) => {
  try {
    const posts = await Post.find({ hidden: false }).sort({ createdAt: -1 }).limit(80);
    const action = posts.length ? Math.random() : 0;

    if (action < 0.45) {
      const post = await createAIPost(req.body || {});
      return res.status(201).json({ action: "post", post });
    }

    const post = randomItem(posts);
    const actor = randomItem(AI_USERS);

    if (action < 0.75) {
      post.likes += 1;
      await post.save();
      await notify(post.user, actor, "like", "Le ha gustado tu publicacion", post._id);
      return res.json({ action: "like", post });
    }

    const commentText = await generateSocialText({
      fallback: randomItem(AI_COMMENTS),
      prompt: `Responde como usuario real de una red profesional nocturna. Maximo 140 caracteres, sin comillas. Publicacion: "${post.text}"`,
    });
    post.comments.push({ user: actor, text: cleanGeneratedText(commentText, 180), intent: "comentario" });
    await post.save();
    await notify(post.user, actor, "comment", commentText, post._id);

    res.status(201).json({ action: "comment", post });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


const AI_USERS = ["ana_after", "luis_network", "maria_growth", "juan_deals", "sara_startup"];
const AI_COMPANIES = ["AfterClose", "NocheLab", "Granada Hub", "Founders Club", "SideProject"];
const AI_CITIES = ["Granada", "Madrid", "Malaga", "Sevilla", "Barcelona"];
const AI_IMAGE_FALLBACKS = [
  "https://images.unsplash.com/photo-1521737604893-d14cc237f11d?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1557804506-669a67965ba0?auto=format&fit=crop&w=1200&q=80",
  "https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=1200&q=80",
];
const AI_COMMENTS = [
  "Me interesa, cuentame mas.",
  "Esto puede encajar con algo que estoy preparando.",
  "Buen enfoque. Lo veo muy accionable.",
  "Tiene pinta de mover conversaciones buenas.",
  "Estoy dentro si buscais feedback.",
];

async function createAIPost(options = {}) {
  const city = options.city || randomItem(AI_CITIES);
  const company = options.company || randomItem(AI_COMPANIES);
  const user = options.user || randomItem(AI_USERS);
  const imageChance = typeof options.withImage === "boolean" ? Number(options.withImage) : 0.55;
  const text = await generateSocialText({
    fallback: `${randomItem(["Busco gente con energia para probar ideas esta semana.", "Hoy hay buenas conversaciones despues del cierre.", "Si tienes un proyecto parado, quiza esta noche sea para desbloquearlo."])} #afterclose #networking`,
    prompt: `Crea un post breve en espanol para AfterClose, una app social profesional con energia nocturna. Ciudad: ${city}. Empresa o contexto: ${company}. Maximo 180 caracteres, tono humano, con 1 o 2 hashtags utiles, sin comillas.`,
  });

  const useImage = Math.random() < imageChance;
  const media = useImage
    ? await generateAIMedia({
        prompt: `Fotografia realista vertical para una app social profesional nocturna en ${city}: personas conversando sobre proyectos, ambiente moderno, energia cercana, sin texto ni logos.`,
      })
    : null;

  const postText = cleanGeneratedText(text, 220);
  const post = new Post({
    user,
    text: postText,
    company,
    intent: "ia",
    city,
    negotiable: false,
    mediaType: media?.mediaUrl ? "photo" : "text",
    mediaUrl: media?.mediaUrl || "",
    cloudinaryPublicId: media?.publicId || "",
    mentions: extractMentions(postText),
    hashtags: extractHashtags(postText),
    likes: Math.floor(Math.random() * 12),
    shares: Math.floor(Math.random() * 4),
    visibilityTier: getVisibilityTier(0),
  });

  await post.save();
  return post;
}

async function generateSocialText({ prompt, fallback }) {
  if (!OPENAI_API_KEY) return fallback;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_TEXT_MODEL,
      input: prompt,
      max_output_tokens: 180,
    }),
  });
  const data = await response.json();

  if (!response.ok) throw new Error(data.error?.message || "No se pudo generar texto con IA");

  return data.output_text || extractResponseText(data) || fallback;
}

async function generateAIMedia({ prompt }) {
  if (!OPENAI_API_KEY || !isCloudinaryConfigured()) {
    return { mediaUrl: randomItem(AI_IMAGE_FALLBACKS), publicId: "" };
  }

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_IMAGE_MODEL,
      prompt,
      size: "1024x1536",
      quality: "low",
      output_format: "jpeg",
    }),
  });
  const data = await response.json();

  if (!response.ok) throw new Error(data.error?.message || "No se pudo generar imagen con IA");

  const imageBase64 = data.data?.[0]?.b64_json;
  if (!imageBase64) return { mediaUrl: randomItem(AI_IMAGE_FALLBACKS), publicId: "" };

  const uploadResult = await cloudinary.uploader.upload(`data:image/jpeg;base64,${imageBase64}`, {
    folder: "afterclose/ai",
    resource_type: "image",
  });

  return { mediaUrl: uploadResult.secure_url, publicId: uploadResult.public_id };
}

function extractResponseText(data) {
  return data.output
    ?.flatMap((item) => item.content || [])
    .map((content) => content.text || "")
    .join(" ")
    .trim();
}

function cleanGeneratedText(value, maxLength) {
  const text = String(value || "")
    .replace(/^["'\s]+|["'\s]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1).trim()}...` : text;
}

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function normalizeChatParticipants(userA, userB) {
  const first = String(userA || "").trim();
  const second = String(userB || "").trim();
  if (!first || !second || first === second) return null;
  return [first, second].sort((a, b) => a.localeCompare(b));
}

function getVisibilityTier(likes = 0) {
  if (likes >= 100) return "destacado";
  if (likes >= 21) return "general";
  if (likes >= 6) return "ciudad";
  return "local";
}
function extractMentions(text) {
  return [...new Set((text.match(/@[a-zA-Z0-9_.-]+/g) || []).map((mention) => mention.slice(1)))];
}

function extractHashtags(text) {
  return [...new Set((text.match(/#[a-zA-Z0-9_.-]+/g) || []).map((tag) => tag.slice(1).toLowerCase()))];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isCloudinaryConfigured() {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

async function notify(user, actor, type, text, postId) {
  if (!user || !actor || user === actor) return;
  await Notification.create({ user, actor, type, text, postId });
}

app.listen(PORT, () => {
  console.log(`Backend funcionando en http://localhost:${PORT}`);
});
