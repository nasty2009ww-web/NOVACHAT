// =========================================================
// NovaChat — Supabase Client & Helper Functions
// =========================================================

const SUPABASE_URL = "https://kfhsbujguywjqqhfbtlg.supabase.co";
const SUPABASE_KEY = "sb_publishable_t7pujZuiyTPcgPqWDQddHg_HiMhRav3";

// التأكد من تحميل مكتبة Supabase
if (typeof window.supabase === 'undefined') {
  console.error("مكتبة Supabase JS غير محملة. تأكد من استدعاء سكريبت CDN أولاً.");
}

// إنشاء عميل Supabase
const supabase = window.supabase ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
}) : null;

// توفير المتغيرات عالمياً لسهولة الاستخدام
window.novaSupabase = supabase;
window.SUPABASE_CONFIG = {
  url: SUPABASE_URL,
  key: SUPABASE_KEY
};

// كائن الخدمات المساعدة
window.NovaAuth = {
  // الحصول على المستخدم الحالي وجلسته
  async getUser() {
    if (!supabase) return null;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || !session.user) return null;
    
    // جلب بيانات البروفايل من جدول profiles
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
      
      return {
        ...session.user,
        profile: profile || {
          username: session.user.user_metadata?.username || session.user.email.split('@')[0],
          display_name: session.user.user_metadata?.display_name || session.user.email.split('@')[0],
          avatar_url: session.user.user_metadata?.avatar_url || null
        }
      };
    } catch (e) {
      return session.user;
    }
  },

  // تسجيل حساب جديد
  async signUp(email, password, username, birthDate) {
    if (!supabase) throw new Error("تعذر الاتصال بـ Supabase");
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: {
          username: username,
          display_name: username,
          birth_date: birthDate
        }
      }
    });
    if (error) throw error;
    return data;
  },

  // تسجيل الدخول
  async signIn(email, password) {
    if (!supabase) throw new Error("تعذر الاتصال بـ Supabase");
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });
    if (error) throw error;
    return data;
  },

  // تسجيل الدخول بواسطة مزود خارجي (Google / Snapchat)
  async signInWithOAuth(provider) {
    if (!supabase) throw new Error("تعذر الاتصال بـ Supabase");
    var redirectUrl = window.location.href.split('?')[0].replace(/(login|signup)\.html/, 'home.html');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: provider.toLowerCase(),
      options: {
        redirectTo: redirectUrl
      }
    });
    if (error) throw error;
    return data;
  },

  // تسجيل الخروج
  async signOut() {
    if (!supabase) return;
    try {
      await supabase.auth.signOut();
    } catch (e) {}
    try {
      localStorage.removeItem("novachat_user");
    } catch (e) {}
  }
};

window.NovaChatDB = {
  // جلب المستخدمين المسجلين
  async getProfiles() {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      console.error("خطأ في جلب البروفايلات:", error);
      return [];
    }
    return data || [];
  },

  // إرسال رسالة
  async sendMessage(senderId, content, conversationId = null) {
    if (!supabase) throw new Error("تعذر الاتصال بـ Supabase");
    const { data, error } = await supabase
      .from('messages')
      .insert([
        {
          sender_id: senderId,
          content: content,
          conversation_id: conversationId
        }
      ])
      .select();
    if (error) throw error;
    return data;
  },

  // جلب الرسائل
  async getMessages(limit = 50) {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('messages')
      .select(`
        id,
        content,
        created_at,
        sender_id,
        profiles (
          id,
          username,
          display_name,
          avatar_url
        )
      `)
      .order('created_at', { ascending: true })
      .limit(limit);
    if (error) {
      console.error("خطأ في جلب الرسائل:", error);
      return [];
    }
    return data || [];
  },

  // الاشتراك في الرسائل المباشرة (Realtime)
  subscribeMessages(onNewMessage) {
    if (!supabase) return null;
    return supabase
      .channel('public:messages')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        async (payload) => {
          // جلب معلومات المرسل مع الرسالة
          try {
            const { data: profile } = await supabase
              .from('profiles')
              .select('id, username, display_name, avatar_url')
              .eq('id', payload.new.sender_id)
              .single();
            payload.new.profiles = profile;
          } catch (e) {}
          onNewMessage(payload.new);
        }
      )
      .subscribe();
  }
};
