const BOT_USERS = ["ana_after", "luis_network", "maria_growth", "juan_deals", "sara_startup"];

const BOT_TEXTS = [
  "Esto empieza a moverse.",
  "Busco socios para validar una idea esta semana.",
  "Gran oportunidad para conectar en Granada.",
  "Alguien con ganas de colaborar esta noche?",
  "Ideas nuevas siempre bienvenidas.",
  "Hoy se viene algo interesante.",
  "Networking real, sin postureo.",
];

const BOT_COMMENTS = [
  "Me interesa mucho esto.",
  "Te escribo por privado.",
  "Buen enfoque.",
  "Esto puede funcionar.",
  "Estoy dentro.",
  "Como podemos hablar?",
];

function random(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class BotEngine {
  constructor(api, getPosts) {
    this.api = api;
    this.getPosts = getPosts;
    this.running = false;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.loop();
  }

  stop() {
    this.running = false;
  }

  async sendMessage(text) {
    if (!this.api) return random(BOT_COMMENTS);
    const response = await this.api("/ai/comment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    return response.text || random(BOT_COMMENTS);
  }

  async loop() {
    while (this.running) {
      try {
        await this.randomAction();
        await sleep(25000 + Math.random() * 30000);
      } catch (e) {
        console.log("Bot error:", e.message);
      }
    }
  }

  async randomAction() {
    const posts = this.getPosts?.() || [];

    if (!posts.length || Math.random() < 0.45) return this.createPost();
    if (Math.random() < 0.65) return this.likePost(posts);
    return this.commentPost(posts);
  }

  async createPost() {
    if (!this.api) return null;
    return this.api("/ai/post", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user: random(BOT_USERS),
        company: "AfterClose",
        text: random(BOT_TEXTS),
        city: "Granada",
      }),
    });
  }

  async likePost(posts) {
    if (!this.api) return null;
    const post = random(posts);
    const user = random(BOT_USERS);

    return this.api(`/like/${post._id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user }),
    });
  }

  async commentPost(posts) {
    if (!this.api) return null;
    const post = random(posts);
    const user = random(BOT_USERS);

    return this.api(`/comment/${post._id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user,
        text: random(BOT_COMMENTS),
        intent: "comentario",
      }),
    });
  }
}
