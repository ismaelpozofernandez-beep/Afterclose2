import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  Share,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import * as ImagePicker from "expo-image-picker";
import { useVideoPlayer, VideoView } from "expo-video";
const DEFAULT_API_HOST =
  process.env.EXPO_PUBLIC_API_HOST ||
  (Platform.OS === "web" ? "http://localhost:3000" : "http://192.168.1.134:3000");
const SKY = "#38bdf8";
const TABS = ["feed", "buscar", "chats", "perfil", "notificaciones"];
const SEARCH_TABS = ["todo", "empresas", "personas", "hashtags", "videos"];
const INTENT_OPTIONS = ["momento", "busco socio", "busco plan", "evento", "ofrezco", "necesito ayuda"];
const COMMENT_INTENTS = ["comentario", "me interesa", "te contacto", "me apunto", "pregunta", "oferta"];
const LIVE_STATUSES = ["Disponible", "En evento", "Buscando contactos", "Abierto a propuestas", "Cerrado por hoy"];
const SCREEN_HEIGHT = Dimensions.get("window").height;

export default function App() {
  const [apiHost, setApiHost] = useState(DEFAULT_API_HOST);
  const [session, setSession] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authUser, setAuthUser] = useState("Ismael");
  const [authPassword, setAuthPassword] = useState("");
  const [authCompany, setAuthCompany] = useState("AfterClose");
  const [activeTab, setActiveTab] = useState("feed");
  const [searchTab, setSearchTab] = useState("todo");
  const [posts, setPosts] = useState([]);
  const [searchResults, setSearchResults] = useState({ users: [], companies: [], hashtags: [], posts: [] });
  const [notifications, setNotifications] = useState([]);
  const [chats, setChats] = useState([]);
  const [activeChat, setActiveChat] = useState(null);
  const [chatTarget, setChatTarget] = useState("");
  const [chatText, setChatText] = useState("");
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("AfterClose");
  const [caption, setCaption] = useState("");
  const [postIntent, setPostIntent] = useState("momento");
  const [postNegotiable, setPostNegotiable] = useState(false);
  const [selectedMedia, setSelectedMedia] = useState(null);
  const [selectedPost, setSelectedPost] = useState(null);
  const [publicProfile, setPublicProfile] = useState(null);
  const [commentText, setCommentText] = useState("");
  const [replyText, setReplyText] = useState("");
  const [commentIntent, setCommentIntent] = useState("comentario");
  const [replyIntent, setReplyIntent] = useState("respuesta");
  const [editingText, setEditingText] = useState("");
  const [bio, setBio] = useState("");
  const [profileCompany, setProfileCompany] = useState("AfterClose");
  const [profileAvatar, setProfileAvatar] = useState("");
  const [profileLocation, setProfileLocation] = useState("");
  const [profileSector, setProfileSector] = useState("");
  const [profileWebsite, setProfileWebsite] = useState("");
  const [profileStatus, setProfileStatus] = useState("Disponible");
  const [activityData, setActivityData] = useState({ zones: [], circles: [] });
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  const API = useMemo(() => apiHost.replace(/\/$/, ""), [apiHost]);
  const user = session?.username || authUser || "Usuario";
  const myPosts = posts.filter((post) => post.user === user);
  const savedPosts = posts.filter((post) => post.savedBy?.includes(user));
  const totalLikes = myPosts.reduce((sum, post) => sum + (post.likes || 0), 0);
  const reputation = totalLikes + myPosts.length * 3 + savedPosts.length * 2;
  const currentMode = new Date().getHours() >= 19 || new Date().getHours() < 6 ? "Modo noche" : "Modo dia";
  const nearbyPosts = useMemo(() => {
  if (!profileLocation) return [];
  return posts.filter(
    (post) =>
      post.city?.toLowerCase() === profileLocation.toLowerCase()
  );
}, [posts, profileLocation]);
  const activityZones = activityData.zones?.length ? activityData.zones : buildActivityZones(posts);
  const temporaryCircles = activityData.circles?.length ? activityData.circles : buildTemporaryCircles(posts);

  const request = async (path, options = {}) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    let res;
    try {
      res = await fetch(`${API}${path}`, { ...options, signal: controller.signal });
    } catch (err) {
      clearTimeout(timer);
      if (err.name === "AbortError") {
        throw new Error(`Tiempo agotado conectando con ${API}. Prueba otra URL backend o usa una URL publica.`);
      }
      throw new Error(`No puedo conectar con el backend en ${API}. Revisa que el servidor este abierto y que el movil este en la misma Wi-Fi.`);
    }
    clearTimeout(timer);

    const raw = await res.text();
    const data = raw ? JSON.parse(raw) : {};

    if (!res.ok) throw new Error(data.error || "Algo ha fallado");

    return data;
  };
const generateAIPost = async () => {
  try {
    const result = await request("/ai/social-pulse", postBody({ city: profileLocation, company: profileCompany || company }));
    if (result.post) updatePost(result.post);
    await loadFeed();
  } catch (err) {
    console.log("AI POST ERROR:", err);
  }
};

const generateComment = async (text) => {
  try {
    const response = await request("/ai/comment", postBody({ text }));
    setCommentText(response.text || "");
    setCommentsOpen(true);
  } catch (err) {
    console.log("Bot error:", err);
  }
};
  const loadFeed = async () => {
    try {
      setBusy(true);
      setError("");
      const data = await request("/feed");
      setPosts(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };


  const loadActivity = async () => {
    try {
      const data = await request("/activity");
      setActivityData(data);
    } catch (_err) {
      setActivityData({ zones: [], circles: [] });
    }
  };

  const loadNotifications = async () => {
    if (!session) return;
    try {
      const data = await request(`/notifications/${encodeURIComponent(user)}`);
      setNotifications(Array.isArray(data) ? data : []);
    } catch (_err) {
      setNotifications([]);
    }
  };

  const loadChats = async () => {
    if (!session) return;
    try {
      const data = await request(`/chats/${encodeURIComponent(user)}`);
      setChats(Array.isArray(data) ? data : []);
    } catch (_err) {
      setChats([]);
    }
  };

  useEffect(() => {
    if (session) {
      loadFeed();
      loadActivity();
    }
  }, [API, session]);
useEffect(() => {
  if (!session) return;

  // Primer pulso IA al entrar.
  generateAIPost();

  // Mantiene el feed vivo mientras la sesion esta activa.
  const interval = setInterval(() => {
    generateAIPost();
  }, 45000);

  return () => clearInterval(interval);
}, [session]);

  useEffect(() => {
    if (session) {
      loadNotifications();
      loadChats();
      setBio(session.bio || "");
      setProfileCompany(session.company || "AfterClose");
      setProfileAvatar(session.avatarUrl || "");
      setProfileLocation(session.location || "");
      setProfileSector(session.sector || "");
      setProfileWebsite(session.website || "");
      setProfileStatus(session.liveStatus || "Disponible");
    }
  }, [session]);

  useEffect(() => {
    if (activeTab === "buscar") search();
    if (activeTab === "chats") loadChats();
  }, [activeTab, searchTab]);

  const authenticate = async () => {
    try {
      setError("");
      setAuthBusy(true);
      const path = authMode === "login" ? "/login" : "/register";
      const data = await request(path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: authUser.trim(),
          password: authPassword,
          company: authCompany.trim(),
        }),
      });

      if (authMode === "register") {
        setAuthMode("login");
        setError("Cuenta creada. Inicia sesion.");
        return;
      }

      setSession({
        token: data.token,
        username: data.username,
        company: data.company || authCompany,
        bio: data.bio || "",
        avatarUrl: data.avatarUrl || "",
        location: data.location || "",
        sector: data.sector || "",
        website: data.website || "",
        liveStatus: data.liveStatus || "Disponible",
        reputation: data.reputation || 0,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setAuthBusy(false);
    }
  };

  const testBackend = async () => {
    try {
      setError("");
      setAuthBusy(true);
      const data = await request("/");
      setError(`Backend conectado: ${data.app || API}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setAuthBusy(false);
    }
  };

  const chooseMedia = async (source = "library", media = "mixed") => {
    try {
      setError("");
      const permission =
        source === "camera"
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (!permission.granted) {
        setError("Necesito permiso para acceder a la camara o galeria.");
        return;
      }

      const options = {
        mediaTypes:
          media === "video"
            ? ImagePicker.MediaTypeOptions.Videos
            : media === "photo"
            ? ImagePicker.MediaTypeOptions.Images
            : ImagePicker.MediaTypeOptions.All,
        allowsEditing: media !== "video",
        aspect: [4, 5],
        quality: 0.78,
      };
      const result =
        source === "camera"
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);

      if (result.canceled) return;

      const asset = result.assets[0];
      const isVideo = asset.type === "video" || asset.mimeType?.startsWith("video/");
      setSelectedMedia({
        uri: asset.uri,
        mimeType: asset.mimeType || (isVideo ? "video/mp4" : "image/jpeg"),
        fileName: asset.fileName || `afterclose-${Date.now()}.${isVideo ? "mp4" : "jpg"}`,
        mediaType: isVideo ? "video" : "photo",
      });
      setCreateOpen(false);
      setActiveTab("crear");
    } catch (err) {
      setError(err.message);
    }
  };


  const openCamera = async () => {
    await chooseMedia("camera", "mixed");
  };

  const uploadMedia = async (asset) => {
    const form = new FormData();

    if (Platform.OS === "web") {
      const fileRes = await fetch(asset.uri);
      const blob = await fileRes.blob();
      form.append("media", blob, asset.fileName);
    } else {
      form.append("media", { uri: asset.uri, name: asset.fileName, type: asset.mimeType });
    }

    const res = await fetch(`${API}/upload-media`, { method: "POST", body: form });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "No se pudo subir el archivo");

    return data;
  };

  const publish = async () => {
    try {
      setError("");
      setUploading(true);
      let uploaded = null;

      if (selectedMedia) uploaded = await uploadMedia(selectedMedia);

      await request("/post", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user,
          company: company.trim() || profileCompany || "AfterClose",
          text: caption.trim() || (uploaded?.mediaType === "video" ? "Nuevo video" : "Nueva publicacion"),
          mediaType: uploaded?.mediaType || "text",
          mediaUrl: uploaded?.mediaUrl || "",
          cloudinaryPublicId: uploaded?.publicId || "",
          intent: postIntent,
          city: profileLocation,
          negotiable: postNegotiable,
        }),
      });

      setCaption("");
      setPostIntent("momento");
      setPostNegotiable(false);
      setSelectedMedia(null);
      await loadFeed();
      setActiveTab("feed");
    } catch (err) {
      setError(err.message);
    } finally {
      setUploading(false);
    }
  };

  const likePost = async (post) => updatePost(await request(`/like/${post._id}`, postBody({ user })));
  const savePost = async (post) => updatePost(await request(`/save/${post._id}`, postBody({ user })));
  const sharePost = async (post) => {
    await request(`/share/${post._id}`, { method: "POST" });
    await Share.share({ message: `${post.user} en AfterClose: ${post.text}` });
    loadFeed();
  };

  const addComment = async () => {
    if (!selectedPost || !commentText.trim()) return;
    const updated = await request(`/comment/${selectedPost._id}`, postBody({ user, text: commentText.trim(), intent: commentIntent }));
    setCommentText("");
    setCommentIntent("comentario");
    setSelectedPost(updated);
    updatePost(updated);
  };

  const addReply = async (commentIndex) => {
    if (!selectedPost || !replyText.trim()) return;
    const updated = await request(
      `/comment/${selectedPost._id}/${commentIndex}/reply`,
      postBody({ user, text: replyText.trim(), intent: replyIntent })
    );
    setReplyText("");
    setReplyIntent("respuesta");
    setSelectedPost(updated);
    updatePost(updated);
  };

  const editPost = async () => {
    if (!selectedPost || !editingText.trim()) return;
    const updated = await request(`/post/${selectedPost._id}`, patchBody({ user, text: editingText.trim() }));
    setMenuOpen(false);
    setEditingText("");
    updatePost(updated);
  };

  const deletePost = async () => {
    if (!selectedPost) return;
    await request(`/post/${selectedPost._id}`, deleteBody({ user }));
    setMenuOpen(false);
    setSelectedPost(null);
    loadFeed();
  };

  const reportPost = async () => {
    if (!selectedPost) return;
    await request(`/report/${selectedPost._id}`, postBody({ user, reason: "Reportado desde la app" }));
    setMenuOpen(false);
    Alert.alert("Reporte enviado", "Gracias. Revisaremos esta publicacion.");
  };

  const blockUser = async (target) => {
    await request("/block", postBody({ user, target }));
    setMenuOpen(false);
    setProfileOpen(false);
    setPosts((current) => current.filter((post) => post.user !== target));
  };

  const follow = async (target, type = "perfil") => {
    await request("/follow", postBody({ user, target, type }));
    if (type === "perfil") await openProfile(target);
  };

  const saveProfile = async () => {
    try {
      const updated = await request(`/profile/${encodeURIComponent(user)}`, patchBody({
        bio,
        company: profileCompany,
        avatarUrl: profileAvatar,
        location: profileLocation,
        sector: profileSector,
        website: profileWebsite,
        liveStatus: profileStatus,
      }));
      setSession((current) => ({
        ...current,
        company: updated.company,
        bio: updated.bio,
        avatarUrl: updated.avatarUrl,
        location: updated.location,
        sector: updated.sector,
        website: updated.website,
        liveStatus: updated.liveStatus,
      }));
    } catch (err) {
      setError(err.message);
    }
  };

function search(value = query) {
  return (async () => {
    try {
      const data = await request(`/search?q=${encodeURIComponent(value)}`);
      setSearchResults(data);
    } catch (err) {
      setError(err.message);
    }
  })();
}

  const openHashtagSearch = (tag) => {
    const cleanTag = tag.replace(/^#/, "");
    setQuery(`#${cleanTag}`);
    setSearchTab("todo");
    setActiveTab("buscar");
    search(`#${cleanTag}`);
  };

  const shareProfile = async (target = user) => {
    await Share.share({ message: `Perfil de @${target} en AfterClose` });
  };

  const openProfile = async (target) => {
    const data = await request(`/profile/${encodeURIComponent(target)}`);
    setPublicProfile(data);
    setProfileOpen(true);
  };

  const openChat = async (target) => {
    if (!target || target === user) return;
    try {
      const data = await request(`/chat/${encodeURIComponent(user)}/${encodeURIComponent(target)}`);
      setChatTarget(target);
      setActiveChat(data);
      setProfileOpen(false);
      setMenuOpen(false);
      setCommentsOpen(false);
      setActiveTab("chats");
      await loadChats();
    } catch (err) {
      setError(err.message);
    }
  };

  const sendChatMessage = async () => {
    if (!chatTarget || !chatText.trim()) return;
    try {
      const data = await request("/chat/message", postBody({ from: user, to: chatTarget, text: chatText.trim() }));
      setActiveChat(data);
      setChatText("");
      await loadChats();
    } catch (err) {
      setError(err.message);
    }
  };

  const updatePost = (updated) => {
    setPosts((current) => current.map((post) => (post._id === updated._id ? updated : post)));
    if (selectedPost?._id === updated._id) setSelectedPost(updated);
  };

  if (!session) {
    return (
      <SafeAreaView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        <View style={styles.authPage}>
          <Text style={styles.logo}>AfterClose</Text>
          <Text style={styles.authTitle}>{authMode === "login" ? "Entrar" : "Crear cuenta"}</Text>
          <TextInput value={authUser} onChangeText={setAuthUser} style={styles.input} placeholder="Usuario" placeholderTextColor="#777" />
          <TextInput
            value={authPassword}
            onChangeText={setAuthPassword}
            secureTextEntry
            style={styles.input}
            placeholder="Password"
            placeholderTextColor="#777"
          />
          {authMode === "register" ? (
            <TextInput
              value={authCompany}
              onChangeText={setAuthCompany}
              style={styles.input}
              placeholder="Empresa"
              placeholderTextColor="#777"
            />
          ) : null}
          <TextInput
            value={apiHost}
            onChangeText={setApiHost}
            autoCapitalize="none"
            autoCorrect={false}
            style={styles.input}
            placeholder="URL backend"
            placeholderTextColor="#777"
          />
          <Pressable style={styles.primaryButton} onPress={authenticate} disabled={authBusy}>
            <Text style={styles.primaryButtonText}>{authBusy ? "Conectando..." : authMode === "login" ? "Iniciar sesion" : "Registrarme"}</Text>
          </Pressable>
          <Pressable style={styles.secondaryButton} onPress={testBackend} disabled={authBusy}>
            <Text style={styles.secondaryButtonText}>Probar backend</Text>
          </Pressable>
          <Pressable onPress={() => setAuthMode(authMode === "login" ? "register" : "login")}>
            <Text style={styles.linkText}>{authMode === "login" ? "Crear cuenta nueva" : "Ya tengo cuenta"}</Text>
          </Pressable>
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar barStyle="light-content" />
      {activeTab === "feed" ? renderFeed() : null}
      {activeTab === "buscar" ? renderSearch() : null}
      {activeTab === "chats" ? renderChats() : null}
      {activeTab === "notificaciones" ? renderNotifications() : null}
      {activeTab === "crear" ? renderCreate() : null}
      {activeTab === "perfil" ? renderProfile() : null}
      <BottomNav
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        notifications={notifications.length}
      />
      {renderCommentsModal()}
      {renderProfileModal()}
      {renderPostMenu()}
      {renderCreatePicker()}
    </SafeAreaView>
  );

  function renderFeed() {
    return (
      <View style={styles.feedScreen}>
        {busy ? <ActivityIndicator style={styles.loader} color="white" /> : null}
        {error ? <Text style={styles.inlineError}>{error}</Text> : null}
        <FlatList
          data={posts}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => <FeedCard item={item} />}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={SCREEN_HEIGHT - 36}
          decelerationRate="fast"
          onRefresh={loadFeed}
          refreshing={busy}
          ListEmptyComponent={
            !busy ? (
              <View style={styles.emptyFeed}>
                <Text style={styles.emptyTitle}>No hay publicaciones</Text>
                <Pressable style={styles.primaryButton} onPress={() => setCreateOpen(true)}>
                  <Text style={styles.primaryButtonText}>Crear la primera</Text>
                </Pressable>
              </View>
            ) : null
          }
        />
      </View>
    );
  }

  function FeedCard({ item }) {
    const mediaUrl = item.mediaUrl || item.imageUri;
    return (
      <View style={styles.videoCard}>
        <View style={styles.videoBackdrop}>
          {item.mediaType === "photo" && mediaUrl ? (
            <Image source={{ uri: mediaUrl }} style={styles.mediaImage} resizeMode="cover" />
          ) : item.mediaType === "video" && mediaUrl ? (
            <VideoPlayer uri={mediaUrl} style={styles.mediaVideo} />
          ) : (
            <Text style={styles.videoInitial}>{(item.company || item.user || "A").slice(0, 1)}</Text>
          )}
        </View>
        <View style={styles.feedTop}>
          <Text style={styles.logoSmall}>AfterClose</Text>
          <TouchableOpacity style={styles.publishPill} onPress={() => setCreateOpen(true)}>
            <Text style={styles.publishPillText}>Crear</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.videoInfo}>
          <TouchableOpacity onPress={() => openProfile(item.user)}>
            <Text style={styles.author}>@{item.user}</Text>
          </TouchableOpacity>
          <View style={styles.feedBadges}>
            <Text style={styles.intentBadge}>{item.intent || "momento"}</Text>
            <Text style={styles.reachBadge}>{getReachLabel(item.likes)}</Text>
            {item.negotiable ? <Text style={styles.intentBadge}>negociable</Text> : null}
          </View>
          <Text style={styles.caption}>{item.text}</Text>
          <TouchableOpacity onPress={() => follow(item.company, "empresa")}>
            <Text style={styles.company}>#{item.company || "AfterClose"}</Text>
          </TouchableOpacity>
          {item.mentions?.length ? <Text style={styles.mentions}>{item.mentions.map((m) => `@${m}`).join(" ")}</Text> : null}
          {item.hashtags?.length ? (
            <View style={styles.hashtagRow}>
              {item.hashtags.map((tag) => (
                <TouchableOpacity key={tag} style={styles.hashtagPill} onPress={() => openHashtagSearch(tag)}>
                  <Text style={styles.hashtagText}>#{tag}</Text>
                </TouchableOpacity>
              ))}
            </View>
          ) : null}
        </View>
       <View style={styles.actions}>
  <ActionButton
    label="Like"
    value={item.likes || 0}
    symbol="♥"
    onPress={() => likePost(item)}
  />

  <ActionButton
    label="Comentar"
    value={item.comments?.length || 0}
    symbol="C"
    onPress={() => openComments(item)}
  />

  <ActionButton
    label="IA"
    value=""
    symbol="AI"
    onPress={() => generateComment(item.text)}
  />

  <ActionButton
    label="Guardar"
    value={item.savedBy?.length || 0}
    symbol="S"
    onPress={() => savePost(item)}
  />

  <ActionButton
    label="Compartir"
    value={item.shares || 0}
    symbol="↗"
    onPress={() => sharePost(item)}
  />

  <ActionButton
    label="Mas"
    value=""
    symbol="..."
    onPress={() => openMenu(item)}
  />
</View>
      </View>
    );
  }

  function renderCreate() {
    return (
      <View style={styles.page}>
        <Text style={styles.pageTitle}>Crear</Text>
        <View style={styles.creatorGrid}>
          <Pressable style={styles.creatorButton} onPress={() => chooseMedia("library", "mixed")}>
            <Text style={styles.creatorButtonText}>Galeria</Text>
          </Pressable>
          <Pressable style={styles.creatorButton} onPress={() => openCamera()}>
            <Text style={styles.creatorButtonText}>Camara</Text>
          </Pressable>
          <Pressable style={styles.creatorButton} onPress={() => chooseMedia("library", "video")}>
            <Text style={styles.creatorButtonText}>Video</Text>
          </Pressable>
        </View>
        <TextInput value={company} onChangeText={setCompany} style={styles.input} placeholder="Empresa" placeholderTextColor="#777" />
        <Text style={styles.inputLabel}>Intencion</Text>
        <OptionRow options={INTENT_OPTIONS} value={postIntent} onChange={setPostIntent} />
        <Pressable style={[styles.toggleButton, postNegotiable && styles.toggleButtonActive]} onPress={() => setPostNegotiable((value) => !value)}>
          <Text style={styles.toggleButtonText}>{postNegotiable ? "Acepta ofertas privadas" : "Marcar como negociable"}</Text>
        </Pressable>
        <TextInput
          value={caption}
          onChangeText={setCaption}
          multiline
          style={[styles.input, styles.composeInput]}
          placeholder="Texto, @menciones y contexto del momento"
          placeholderTextColor="#777"
        />
        {selectedMedia ? (
          selectedMedia.mediaType === "photo" ? (
            <Image source={{ uri: selectedMedia.uri }} style={styles.preview} resizeMode="cover" />
          ) : (
            <View style={styles.previewVideo}>
              <VideoPlayer uri={selectedMedia.uri} style={styles.previewVideoPlayer} />
              <Text style={styles.emptySmall}>{selectedMedia.fileName}</Text>
            </View>
          )
        ) : null}
        <Pressable style={styles.primaryButton} onPress={publish} disabled={uploading}>
          <Text style={styles.primaryButtonText}>{uploading ? "Subiendo..." : "Publicar"}</Text>
        </Pressable>
        {uploading ? <Text style={styles.emptySmall}>Subiendo a Cloudinary. Manten la app abierta.</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }

  function renderNotifications() {
    return (
      <View style={styles.page}>
        <Text style={styles.pageTitle}>Notificaciones</Text>
        <Pressable style={styles.primaryButton} onPress={loadNotifications}>
          <Text style={styles.primaryButtonText}>Actualizar</Text>
        </Pressable>
        <FlatList
          data={notifications}
          keyExtractor={(item) => item._id}
          contentContainerStyle={styles.notificationsList}
          renderItem={({ item }) => (
            <View style={styles.notificationCard}>
              <Text style={styles.notificationActor}>@{item.actor}</Text>
              <Text style={styles.notificationText}>{item.text}</Text>
              <Text style={styles.notificationType}>{item.type}</Text>
            </View>
          )}
          ListEmptyComponent={<Text style={styles.emptySmall}>Todavia no tienes notificaciones.</Text>}
        />
      </View>
    );
  }

  function renderChats() {
    const messages = activeChat?.messages || [];
    return (
      <View style={styles.page}>
        <View style={styles.chatHeader}>
          <Text style={styles.pageTitle}>Chats</Text>
          {activeChat ? (
            <Pressable style={styles.secondaryButton} onPress={() => setActiveChat(null)}>
              <Text style={styles.secondaryButtonText}>Lista</Text>
            </Pressable>
          ) : null}
        </View>
        {activeChat ? (
          <View style={styles.chatPanel}>
            <Text style={styles.chatTitle}>@{chatTarget}</Text>
            <FlatList
              data={messages}
              keyExtractor={(item, index) => `${item.createdAt}-${index}`}
              style={styles.messagesList}
              renderItem={({ item }) => (
                <View style={[styles.messageBubble, item.from === user ? styles.messageMine : styles.messageTheirs]}>
                  <Text style={styles.messageAuthor}>{item.from === user ? "Tu" : `@${item.from}`}</Text>
                  <Text style={styles.messageText}>{item.text}</Text>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.emptySmall}>Todavia no hay mensajes. Rompe el hielo.</Text>}
            />
            <View style={styles.chatComposer}>
              <TextInput
                value={chatText}
                onChangeText={setChatText}
                style={[styles.input, styles.chatInput]}
                placeholder="Escribe un mensaje"
                placeholderTextColor="#777"
              />
              <Pressable style={styles.smallButton} onPress={sendChatMessage}>
                <Text style={styles.smallButtonText}>Enviar</Text>
              </Pressable>
            </View>
          </View>
        ) : (
          <FlatList
            data={chats}
            keyExtractor={(item) => item._id}
            renderItem={({ item }) => (
              <TouchableOpacity style={styles.chatItem} onPress={() => openChat(item.user)}>
                <View style={styles.chatAvatar}>
                  <Text style={styles.chatAvatarText}>{item.user?.slice(0, 1).toUpperCase()}</Text>
                </View>
                <View style={styles.chatCopy}>
                  <Text style={styles.chatName}>@{item.user}</Text>
                  <Text style={styles.chatPreview} numberOfLines={1}>{item.lastMessage || "Abrir conversacion"}</Text>
                </View>
                {item.unread ? <Text style={styles.unreadBadge}>{item.unread}</Text> : null}
              </TouchableOpacity>
            )}
            ListEmptyComponent={<Text style={styles.emptySmall}>No tienes chats todavia. Abre un perfil y pulsa Chat.</Text>}
          />
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </View>
    );
  }

  function renderSearch() {
    const users = searchResults.users || [];
    const companies = searchResults.companies || [];
    const hashtags = searchResults.hashtags || [];
    const videos = searchResults.posts || [];
    return (
      <View style={styles.page}>
        <Text style={styles.pageTitle}>Buscar</Text>
        <View style={styles.searchRow}>
          <TextInput
            value={query}
            onChangeText={setQuery}
            style={[styles.input, styles.searchInput]}
            placeholder="Empresas, perfiles, #hashtags o @menciones"
            placeholderTextColor="#777"
          />
          <Pressable style={styles.smallButton} onPress={() => search()}>
            <Text style={styles.smallButtonText}>Ir</Text>
          </Pressable>
        </View>
        {searchTab === "todo" ? (
          <View style={styles.discoveryPanel}>
            <Text style={styles.discoveryTitle}>{currentMode}</Text>
            <Text style={styles.emptySmall}>Cerca de ti: {nearbyPosts.length} publicaciones en {profileLocation || "tu ciudad"}</Text>
          </View>
        ) : null}
        <View style={styles.segmented}>
          {SEARCH_TABS.map((tab) => (
            <Pressable key={tab} style={[styles.segment, searchTab === tab && styles.segmentActive]} onPress={() => setSearchTab(tab)}>
              <Text style={[styles.segmentText, searchTab === tab && styles.segmentTextActive]}>{tab}</Text>
            </Pressable>
          ))}
        </View>
        {searchTab === "todo" && (
          <>
            <ResultSection title="Cerca de ti" items={nearbyPosts.slice(0, 5).map((post) => ({ type: post.intent || "post", name: `@${post.user}`, subtitle: post.text }))} />
            <ResultSection title="Circulos temporales" items={temporaryCircles.map((circle) => ({ type: "circulo", name: circle.name, subtitle: `${circle.posts} publicaciones   ${circle.expiresIn || "24h"}` }))} />
            <ResultSection title="Mapa de actividad" items={activityZones.map((zone) => ({ type: "zona", name: zone.name, subtitle: `${zone.posts} posts   ${zone.likes} likes` }))} />
          </>
        )}
        {(searchTab === "todo" || searchTab === "empresas") && (
          <ResultSection title="Empresas" items={companies} onPress={(item) => follow(item.name, "empresa")} />
        )}
        {(searchTab === "todo" || searchTab === "personas") && (
          <ResultSection title="Personas" items={users} onPress={(item) => openProfile(item.name)} />
        )}
        {(searchTab === "todo" || searchTab === "hashtags") && (
          <ResultSection title="Hashtags" items={hashtags} onPress={(item) => openHashtagSearch(item.name)} />
        )}
        {(searchTab === "todo" || searchTab === "videos") && (
          <ResultSection
            title="Videos"
            items={videos.map((post) => ({ type: post.mediaType || "post", name: `@${post.user}`, subtitle: post.text }))}
          />
        )}
      </View>
    );
  }

  function renderProfile() {
    return (
      <View style={styles.page}>
        <Text style={styles.pageTitle}>Perfil</Text>
        <View style={styles.profileCard}>
          {profileAvatar ? (
            <Image source={{ uri: profileAvatar }} style={styles.profileAvatarImage} />
          ) : (
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>{user.slice(0, 1).toUpperCase()}</Text>
            </View>
          )}
          <Text style={styles.profileName}>{user}</Text>
          <TextInput value={profileAvatar} onChangeText={setProfileAvatar} style={styles.input} placeholder="URL foto de perfil" placeholderTextColor="#777" />
          <TextInput value={profileCompany} onChangeText={setProfileCompany} style={styles.input} placeholder="Empresa" placeholderTextColor="#777" />
          <TextInput value={profileSector} onChangeText={setProfileSector} style={styles.input} placeholder="Sector" placeholderTextColor="#777" />
          <TextInput value={profileLocation} onChangeText={setProfileLocation} style={styles.input} placeholder="Ciudad" placeholderTextColor="#777" />
          <TextInput value={profileWebsite} onChangeText={setProfileWebsite} style={styles.input} placeholder="Web o link" placeholderTextColor="#777" />
          <Text style={styles.inputLabel}>Estado en vivo</Text>
          <OptionRow options={LIVE_STATUSES} value={profileStatus} onChange={setProfileStatus} />
          <TextInput value={bio} onChangeText={setBio} style={[styles.input, styles.bioInput]} placeholder="Bio" placeholderTextColor="#777" />
          <View style={styles.statsRow}>
            <Stat label="Posts" value={myPosts.length} />
            <Stat label="Likes" value={totalLikes} />
            <Stat label="Guardados" value={savedPosts.length} />
            <Stat label="Reputacion" value={reputation} />
          </View>
          <View style={styles.modalActions}>
            <Pressable style={styles.secondaryButton} onPress={() => shareProfile()}>
              <Text style={styles.secondaryButtonText}>Compartir</Text>
            </Pressable>
            <Pressable style={styles.primaryButton} onPress={saveProfile}>
              <Text style={styles.primaryButtonText}>Guardar perfil</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.sectionTitle}>Tus publicaciones</Text>
        <FlatList
          data={myPosts}
          keyExtractor={(item) => item._id}
          renderItem={({ item }) => (
            <TouchableOpacity style={styles.profilePost} onPress={() => openMenu(item)}>
              {(item.mediaUrl || item.imageUri) && item.mediaType === "photo" ? (
                <Image source={{ uri: item.mediaUrl || item.imageUri }} style={styles.profilePostImage} />
              ) : null}
              <Text style={styles.profilePostText}>{item.text}</Text>
              <Text style={styles.profilePostMeta}>
                {item.likes || 0} likes · {item.comments?.length || 0} comentarios · {item.savedBy?.length || 0} guardados
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>
    );
  }

  function openComments(post) {
    setSelectedPost(post);
    setCommentsOpen(true);
  }

  function openMenu(post) {
    setSelectedPost(post);
    setEditingText(post.text);
    setMenuOpen(true);
  }

  function renderCommentsModal() {
    return (
      <Modal visible={commentsOpen} animationType="slide" transparent>
        <View style={styles.modalShade}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Comentarios</Text>
            <FlatList
              data={selectedPost?.comments || []}
              keyExtractor={(item, index) => `${item.createdAt}-${index}`}
              style={styles.commentsList}
              renderItem={({ item, index }) => (
                <View style={styles.comment}>
                  <Text style={styles.commentUser}>@{item.user}   {item.intent || "comentario"}</Text>
                  <Text style={styles.commentText}>{item.text}</Text>
                  {item.replies?.map((reply, replyIndex) => (
                    <Text key={`${reply.createdAt}-${replyIndex}`} style={styles.replyText}>
                      @{reply.user}   {reply.intent || "respuesta"}: {reply.text}
                    </Text>
                  ))}
                  <View style={styles.searchRow}>
                    <TextInput
                      value={replyText}
                      onChangeText={setReplyText}
                      style={[styles.input, styles.searchInput]}
                      placeholder="Responder"
                      placeholderTextColor="#777"
                    />
                    <Pressable style={styles.smallButton} onPress={() => addReply(index)}>
                      <Text style={styles.smallButtonText}>Enviar</Text>
                    </Pressable>
                  </View>
                </View>
              )}
              ListEmptyComponent={<Text style={styles.emptySmall}>Se el primero en comentar.</Text>}
            />
            <View style={styles.searchRow}>
              <TextInput
                value={commentText}
                onChangeText={setCommentText}
                style={[styles.input, styles.searchInput]}
                placeholder="Escribe un comentario..."
                placeholderTextColor="#777"
              />
              <Pressable style={styles.smallButton} onPress={addComment}>
                <Text style={styles.smallButtonText}>Enviar</Text>
              </Pressable>
            </View>
            <Pressable style={styles.secondaryButton} onPress={() => setCommentsOpen(false)}>
              <Text style={styles.secondaryButtonText}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  function renderProfileModal() {
    const data = publicProfile;
    return (
      <Modal visible={profileOpen} animationType="slide" transparent>
        <View style={styles.modalShade}>
          <View style={styles.modalCard}>
            {data?.profile?.avatarUrl ? <Image source={{ uri: data.profile.avatarUrl }} style={styles.profileAvatarImage} /> : null}
            <Text style={styles.modalTitle}>@{data?.user}</Text>
            <Text style={styles.emptySmall}>{data?.profile?.bio || "Sin bio todavia"}</Text>
            <Text style={styles.company}>#{data?.profile?.company || "Sin empresa"}</Text>
            {data?.profile?.sector ? <Text style={styles.profileMeta}>{data.profile.sector}</Text> : null}
            {data?.profile?.location ? <Text style={styles.profileMeta}>{data.profile.location}</Text> : null}
            {data?.profile?.website ? <Text style={styles.profileMeta}>{data.profile.website}</Text> : null}
            {data?.profile?.liveStatus ? <Text style={styles.intentBadge}>{data.profile.liveStatus}</Text> : null}
            <View style={styles.statsRow}>
              <Stat label="Posts" value={data?.stats?.posts || 0} />
              <Stat label="Likes" value={data?.stats?.likes || 0} />
              <Stat label="Siguiendo" value={data?.stats?.following || 0} />
            </View>
            <View style={styles.modalActions}>
              <Pressable style={styles.secondaryButton} onPress={() => blockUser(data?.user)}>
                <Text style={styles.secondaryButtonText}>Bloquear</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => shareProfile(data?.user)}>
                <Text style={styles.secondaryButtonText}>Compartir</Text>
              </Pressable>
              <Pressable style={styles.secondaryButton} onPress={() => openChat(data?.user)}>
                <Text style={styles.secondaryButtonText}>Chat</Text>
              </Pressable>
              <Pressable style={styles.primaryButton} onPress={() => follow(data?.user, "perfil")}>
                <Text style={styles.primaryButtonText}>Seguir</Text>
              </Pressable>
            </View>
            <Pressable style={styles.secondaryButton} onPress={() => setProfileOpen(false)}>
              <Text style={styles.secondaryButtonText}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  function renderPostMenu() {
    const isOwner = selectedPost?.user === user;
    return (
      <Modal visible={menuOpen} animationType="slide" transparent>
        <View style={styles.modalShade}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Publicacion</Text>
            {isOwner ? (
              <>
                <TextInput value={editingText} onChangeText={setEditingText} style={[styles.input, styles.bioInput]} />
                <View style={styles.modalActions}>
                  <Pressable style={styles.secondaryButton} onPress={deletePost}>
                    <Text style={styles.secondaryButtonText}>Borrar</Text>
                  </Pressable>
                  <Pressable style={styles.primaryButton} onPress={editPost}>
                    <Text style={styles.primaryButtonText}>Guardar</Text>
                  </Pressable>
                </View>
              </>
            ) : (
              <View style={styles.modalActions}>
                <Pressable style={styles.secondaryButton} onPress={reportPost}>
                  <Text style={styles.secondaryButtonText}>Reportar</Text>
                </Pressable>
                <Pressable style={styles.secondaryButton} onPress={() => blockUser(selectedPost?.user)}>
                  <Text style={styles.secondaryButtonText}>Bloquear</Text>
                </Pressable>
                <Pressable style={styles.primaryButton} onPress={() => openChat(selectedPost?.user)}>
                  <Text style={styles.primaryButtonText}>Chat</Text>
                </Pressable>
              </View>
            )}
            <Pressable style={styles.secondaryButton} onPress={() => setMenuOpen(false)}>
              <Text style={styles.secondaryButtonText}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }

  function renderCreatePicker() {
    return (
      <Modal visible={createOpen} animationType="fade" transparent>
        <View style={styles.modalShade}>
          <View style={styles.createPickerCard}>
            <Text style={styles.modalTitle}>Crear</Text>
            <View style={styles.createOptions}>
              <Pressable style={styles.createOption} onPress={() => chooseMedia("library", "video")}>
                <Text style={styles.createOptionSymbol}>▶</Text>
                <Text style={styles.createOptionText}>Video</Text>
              </Pressable>
              <Pressable style={styles.createOption} onPress={() => chooseMedia("library", "photo")}>
                <Text style={styles.createOptionSymbol}>□</Text>
                <Text style={styles.createOptionText}>Foto</Text>
              </Pressable>
              <Pressable style={styles.createOption} onPress={() => openCamera()}>
                <Text style={styles.createOptionSymbol}>◎</Text>
                <Text style={styles.createOptionText}>Camara</Text>
              </Pressable>
            </View>
            <Pressable style={styles.secondaryButton} onPress={() => setCreateOpen(false)}>
              <Text style={styles.secondaryButtonText}>Cerrar</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    );
  }
}

function OptionRow({ options, value, onChange }) {
  return (
    <View style={styles.optionRow}>
      {options.map((option) => (
        <Pressable key={option} style={[styles.optionChip, value === option && styles.optionChipActive]} onPress={() => onChange(option)}>
          <Text style={[styles.optionChipText, value === option && styles.optionChipTextActive]}>{option}</Text>
        </Pressable>
      ))}
    </View>
  );
}

function getReachLabel(likes = 0) {
  if (likes >= 100) return "Destacado";
  if (likes >= 21) return "Feed general";
  if (likes >= 6) return "Ciudad";
  return "Local";
}

function buildActivityZones(posts) {
  const zones = new Map();
  posts.forEach((post) => {
    const name = post.city || post.company || "AfterClose";
    const current = zones.get(name) || { name, posts: 0, likes: 0 };
    current.posts += 1;
    current.likes += post.likes || 0;
    zones.set(name, current);
  });
  return [...zones.values()].sort((a, b) => b.likes - a.likes || b.posts - a.posts).slice(0, 8);
}

function buildTemporaryCircles(posts) {
  const circles = new Map();
  posts.forEach((post) => {
    (post.hashtags || []).forEach((tag) => {
      const name = `${post.city || "Global"} #${tag}`;
      const current = circles.get(name) || { name, posts: 0, expiresIn: "24h" };
      current.posts += 1;
      circles.set(name, current);
    });
  });
  return [...circles.values()].sort((a, b) => b.posts - a.posts).slice(0, 8);
}
function VideoPlayer({ uri, style }) {
  const player = useVideoPlayer(uri, (instance) => {
    instance.loop = true;
    instance.play();
  });

  return (
    <VideoView
      player={player}
      style={style}
      nativeControls
      allowsFullscreen
      contentFit="cover"
      surfaceType="textureView"
    />
  );
}
function postBody(body) {
  return { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function patchBody(body) {
  return { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function deleteBody(body) {
  return { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
}

function BottomNav({ activeTab, setActiveTab, notifications }) {
  return (
    <View style={styles.bottomNav}>
      {TABS.map((tab) => (
        <TouchableOpacity
          key={tab}
          style={styles.navItem}
          onPress={() => setActiveTab(tab)}
        >
          <Text style={[styles.navText, activeTab === tab && styles.navTextActive]}>
            {tab === "feed"
              ? "Videos"
              : tab === "chats"
              ? "Chats"
              : tab === "perfil"
              ? "Perfil"
              : tab === "notificaciones"
              ? `Avisos${notifications ? ` ${notifications}` : ""}`
              : "Buscar"}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function ActionButton({ label, value, symbol, onPress }) {
  return (
    <TouchableOpacity style={styles.actionButton} onPress={onPress}>
      <Text style={styles.actionIcon}>{symbol}</Text>
      {value !== "" ? <Text style={styles.actionValue}>{value}</Text> : null}
      <Text style={styles.actionLabel}>{label}</Text>
    </TouchableOpacity>
  );
}

function ResultSection({ title, items, onPress }) {
  return (
    <View style={styles.resultSection}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {items?.length ? (
        items.map((item, index) => (
          <TouchableOpacity key={`${title}-${item.name}-${index}`} style={styles.resultItem} onPress={() => onPress?.(item)}>
            <Text style={styles.resultType}>{item.type}</Text>
            <View style={styles.resultCopy}>
              <Text style={styles.resultName}>{item.name}</Text>
              <Text style={styles.resultSubtitle} numberOfLines={2}>
                {item.subtitle}
              </Text>
            </View>
          </TouchableOpacity>
        ))
      ) : (
        <Text style={styles.emptySmall}>Sin resultados.</Text>
      )}
    </View>
  );
}

function Stat({ label, value }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "#050507" },
  authPage: { flex: 1, gap: 12, justifyContent: "center", padding: 22 },
  logo: { color: "white", fontSize: 38, fontWeight: "900" },
  authTitle: { color: "#bae6fd", fontSize: 20, fontWeight: "900", marginBottom: 8 },
  linkText: { color: SKY, fontWeight: "900", marginTop: 4, textAlign: "center" },
  feedScreen: { flex: 1 },
  videoCard: { height: SCREEN_HEIGHT - 36, backgroundColor: "#08080c", justifyContent: "flex-end", overflow: "hidden" },
  videoBackdrop: { ...StyleSheet.absoluteFillObject, alignItems: "center", backgroundColor: "#15151e", justifyContent: "center" },
  mediaImage: { height: "100%", width: "100%" },
  mediaVideo: { height: "100%", width: "100%" },
  videoPlaceholder: { alignItems: "center", padding: 26 },
  videoPlay: { color: "white", fontSize: 42, fontWeight: "900" },
  videoUrl: { color: "#8d8d98", marginTop: 12, textAlign: "center" },
  videoInitial: { color: "#2f2f3b", fontSize: 180, fontWeight: "900" },
  feedTop: { alignItems: "center", flexDirection: "row", justifyContent: "space-between", left: 18, position: "absolute", right: 18, top: 18 },
  logoSmall: { color: "white", fontSize: 22, fontWeight: "900" },
  publishPill: { backgroundColor: SKY, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 9 },
  publishPillText: { color: "white", fontWeight: "900" },
  videoInfo: { bottom: 74, left: 18, position: "absolute", right: 92 },
  author: { color: "white", fontSize: 18, fontWeight: "900", marginBottom: 8 },
  caption: { color: "white", fontSize: 16, lineHeight: 22 },
  feedBadges: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8 },
  intentBadge: { alignSelf: "flex-start", backgroundColor: "rgba(56, 189, 248, 0.18)", borderColor: "rgba(125, 211, 252, 0.45)", borderRadius: 8, borderWidth: 1, color: "#bae6fd", fontSize: 11, fontWeight: "900", paddingHorizontal: 8, paddingVertical: 4, textTransform: "uppercase" },
  reachBadge: { alignSelf: "flex-start", backgroundColor: "rgba(250, 204, 21, 0.18)", borderColor: "rgba(250, 204, 21, 0.45)", borderRadius: 8, borderWidth: 1, color: "#fde68a", fontSize: 11, fontWeight: "900", paddingHorizontal: 8, paddingVertical: 4, textTransform: "uppercase" },
  company: { color: "#bae6fd", fontSize: 14, fontWeight: "800", marginTop: 10 },
  mentions: { color: SKY, fontWeight: "800", marginTop: 6 },
  hashtagRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 },
  hashtagPill: { backgroundColor: "rgba(56, 189, 248, 0.16)", borderColor: "rgba(125, 211, 252, 0.48)", borderRadius: 8, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 5 },
  hashtagText: { color: "#bae6fd", fontSize: 12, fontWeight: "900" },
  actions: { bottom: 84, gap: 12, position: "absolute", right: 14, width: 76 },
  actionButton: { alignItems: "center" },
  actionIcon: { color: "white", fontSize: 25, fontWeight: "900" },
  actionValue: { color: "white", fontSize: 12, fontWeight: "900", marginTop: 2 },
  actionLabel: { color: "#d7d7df", fontSize: 10, marginTop: 2 },
  bottomNav: { alignItems: "center", backgroundColor: "#050507", borderTopColor: "#20202a", borderTopWidth: 1, bottom: 0, flexDirection: "row", height: 62, justifyContent: "space-around", left: 0, position: "absolute", right: 0 },
  navItem: { alignItems: "center", flex: 1, paddingVertical: 12 },
  navText: { color: "#8d8d98", fontSize: 13, fontWeight: "900" },
  navTextActive: { color: "white" },
  page: { flex: 1, paddingHorizontal: 18, paddingTop: 24, paddingBottom: 76 },
  pageTitle: { color: "white", fontSize: 30, fontWeight: "900", marginBottom: 16 },
  input: { backgroundColor: "#181820", borderColor: "#30303a", borderRadius: 8, borderWidth: 1, color: "white", fontSize: 15, paddingHorizontal: 12, paddingVertical: 12 },
  inputLabel: { color: "#a9a9b4", fontSize: 12, fontWeight: "900", marginTop: 8, textTransform: "uppercase" },
  optionRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 8, marginTop: 6 },
  optionChip: { borderColor: "#30303a", borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  optionChipActive: { backgroundColor: SKY, borderColor: SKY },
  optionChipText: { color: "#a9a9b4", fontSize: 12, fontWeight: "900" },
  optionChipTextActive: { color: "white" },
  toggleButton: { alignItems: "center", borderColor: "#30303a", borderRadius: 8, borderWidth: 1, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 10 },
  toggleButtonActive: { backgroundColor: "rgba(56, 189, 248, 0.2)", borderColor: SKY },
  toggleButtonText: { color: "white", fontWeight: "900" },
  bioInput: { marginTop: 10, minHeight: 78, textAlignVertical: "top" },
  searchRow: { alignItems: "center", flexDirection: "row", gap: 10, marginTop: 10 },
  searchInput: { flex: 1 },
  smallButton: { alignItems: "center", backgroundColor: SKY, borderRadius: 8, justifyContent: "center", minHeight: 46, paddingHorizontal: 16 },
  smallButtonText: { color: "white", fontWeight: "900" },
  discoveryPanel: { backgroundColor: "#101820", borderColor: "#1f3a4a", borderRadius: 8, borderWidth: 1, marginTop: 14, padding: 12 },
  discoveryTitle: { color: "white", fontSize: 16, fontWeight: "900" },
  segmented: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 14 },
  segment: { borderColor: "#30303a", borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 8 },
  segmentActive: { backgroundColor: SKY, borderColor: SKY },
  segmentText: { color: "#a9a9b4", fontSize: 12, fontWeight: "900" },
  segmentTextActive: { color: "white" },
  creatorGrid: { flexDirection: "row", gap: 10, marginBottom: 12 },
  creatorButton: { alignItems: "center", backgroundColor: SKY, borderRadius: 8, flex: 1, padding: 14 },
  creatorButtonText: { color: "white", fontWeight: "900" },
  composeInput: { marginTop: 10, minHeight: 130, textAlignVertical: "top" },
  preview: { aspectRatio: 4 / 5, borderRadius: 8, marginVertical: 12, width: "100%" },
  previewVideo: { alignItems: "center", backgroundColor: "#15151d", borderRadius: 8, marginVertical: 12, overflow: "hidden", padding: 12 },
  previewVideoText: { color: "white", fontSize: 18, fontWeight: "900" },
  previewVideoPlayer: { aspectRatio: 4 / 5, borderRadius: 8, width: "100%" },
  resultSection: { marginTop: 22 },
  sectionTitle: { color: "white", fontSize: 18, fontWeight: "900", marginBottom: 10, marginTop: 18 },
  resultItem: { alignItems: "center", backgroundColor: "#15151d", borderColor: "#2a2a35", borderRadius: 8, borderWidth: 1, flexDirection: "row", gap: 12, marginBottom: 10, padding: 12 },
  resultType: { color: SKY, fontSize: 11, fontWeight: "900", textTransform: "uppercase", width: 64 },
  resultCopy: { flex: 1 },
  resultName: { color: "white", fontSize: 16, fontWeight: "900" },
  resultSubtitle: { color: "#a9a9b4", marginTop: 3 },
  profileCard: { alignItems: "stretch", backgroundColor: "#15151d", borderColor: "#2a2a35", borderRadius: 8, borderWidth: 1, gap: 10, padding: 18 },
  avatar: { alignItems: "center", alignSelf: "center", backgroundColor: SKY, borderRadius: 44, height: 88, justifyContent: "center", width: 88 },
  profileAvatarImage: { alignSelf: "center", borderRadius: 44, height: 88, width: 88 },
  avatarText: { color: "white", fontSize: 38, fontWeight: "900" },
  profileName: { color: "white", fontSize: 24, fontWeight: "900", marginVertical: 8, textAlign: "center" },
  profileMeta: { color: "#a9a9b4", marginTop: 6 },
  statsRow: { flexDirection: "row", justifyContent: "space-around", marginVertical: 18, width: "100%" },
  stat: { alignItems: "center" },
  statValue: { color: "white", fontSize: 22, fontWeight: "900" },
  statLabel: { color: "#a9a9b4", fontSize: 12, marginTop: 2 },
  notification: { backgroundColor: "#101820", borderRadius: 8, color: "#d7d7df", marginBottom: 8, padding: 10 },
  notificationsList: { paddingTop: 14, paddingBottom: 90 },
  notificationCard: { backgroundColor: "#101820", borderColor: "#1f3a4a", borderRadius: 8, borderWidth: 1, marginBottom: 10, padding: 12 },
  notificationActor: { color: "white", fontSize: 16, fontWeight: "900" },
  notificationText: { color: "#d7d7df", marginTop: 4 },
  notificationType: { color: SKY, fontSize: 12, fontWeight: "900", marginTop: 8, textTransform: "uppercase" },
  chatHeader: { alignItems: "center", flexDirection: "row", justifyContent: "space-between" },
  chatPanel: { flex: 1 },
  chatTitle: { color: "#bae6fd", fontSize: 18, fontWeight: "900", marginBottom: 10 },
  chatItem: { alignItems: "center", backgroundColor: "#15151d", borderColor: "#2a2a35", borderRadius: 8, borderWidth: 1, flexDirection: "row", gap: 12, marginBottom: 10, padding: 12 },
  chatAvatar: { alignItems: "center", backgroundColor: SKY, borderRadius: 24, height: 48, justifyContent: "center", width: 48 },
  chatAvatarText: { color: "white", fontSize: 20, fontWeight: "900" },
  chatCopy: { flex: 1 },
  chatName: { color: "white", fontSize: 16, fontWeight: "900" },
  chatPreview: { color: "#a9a9b4", marginTop: 4 },
  unreadBadge: { backgroundColor: SKY, borderRadius: 10, color: "white", fontSize: 12, fontWeight: "900", minWidth: 20, overflow: "hidden", paddingHorizontal: 6, paddingVertical: 2, textAlign: "center" },
  messagesList: { flex: 1, marginBottom: 10 },
  messageBubble: { borderRadius: 8, marginBottom: 8, maxWidth: "82%", padding: 10 },
  messageMine: { alignSelf: "flex-end", backgroundColor: "#075985" },
  messageTheirs: { alignSelf: "flex-start", backgroundColor: "#1f2937" },
  messageAuthor: { color: "#bae6fd", fontSize: 11, fontWeight: "900", marginBottom: 4 },
  messageText: { color: "white", lineHeight: 20 },
  chatComposer: { alignItems: "center", flexDirection: "row", gap: 8 },
  chatInput: { flex: 1 },
  profilePost: { backgroundColor: "#15151d", borderRadius: 8, marginBottom: 10, padding: 12 },
  profilePostImage: { aspectRatio: 4 / 5, borderRadius: 8, marginBottom: 10, width: "100%" },
  profilePostText: { color: "white", lineHeight: 21 },
  profilePostMeta: { color: "#a9a9b4", fontSize: 12, marginTop: 8 },
  primaryButton: { alignItems: "center", backgroundColor: SKY, borderRadius: 8, justifyContent: "center", minHeight: 46, paddingHorizontal: 18, paddingVertical: 12 },
  primaryButtonText: { color: "white", fontSize: 15, fontWeight: "900" },
  secondaryButton: { alignItems: "center", backgroundColor: "#262631", borderRadius: 8, justifyContent: "center", minHeight: 46, paddingHorizontal: 18, paddingVertical: 12 },
  secondaryButtonText: { color: "white", fontWeight: "900" },
  modalShade: { backgroundColor: "rgba(0,0,0,0.72)", flex: 1, justifyContent: "flex-end" },
  modalCard: { backgroundColor: "#101014", borderTopLeftRadius: 8, borderTopRightRadius: 8, maxHeight: "84%", padding: 18 },
  createPickerCard: { backgroundColor: "#101014", borderTopLeftRadius: 8, borderTopRightRadius: 8, padding: 18 },
  createOptions: { flexDirection: "row", gap: 10, marginBottom: 16 },
  createOption: { alignItems: "center", backgroundColor: SKY, borderRadius: 8, flex: 1, minHeight: 92, justifyContent: "center", padding: 12 },
  createOptionSymbol: { color: "white", fontSize: 28, fontWeight: "900" },
  createOptionText: { color: "white", fontWeight: "900", marginTop: 6 },
  modalTitle: { color: "white", fontSize: 22, fontWeight: "900", marginBottom: 14 },
  modalActions: { flexDirection: "row", gap: 10, justifyContent: "flex-end", marginTop: 14 },
  commentsList: { maxHeight: 340 },
  comment: { borderBottomColor: "#252530", borderBottomWidth: 1, paddingVertical: 10 },
  commentUser: { color: "white", fontWeight: "900" },
  commentText: { color: "#d7d7df", marginTop: 3 },
  replyText: { color: "#bae6fd", marginLeft: 12, marginTop: 6 },
  loader: { left: 0, position: "absolute", right: 0, top: 60, zIndex: 3 },
  inlineError: { backgroundColor: "rgba(2, 132, 199, 0.92)", color: "white", left: 14, padding: 10, position: "absolute", right: 14, top: 64, zIndex: 4 },
  error: { color: "#7dd3fc", marginTop: 10 },
  emptyFeed: { alignItems: "center", height: SCREEN_HEIGHT - 36, justifyContent: "center", padding: 24 },
  emptyTitle: { color: "white", fontSize: 22, fontWeight: "900", marginBottom: 14 },
  emptySmall: { color: "#8d8d98", marginVertical: 8 },
});
