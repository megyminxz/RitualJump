// Supabase Configuration
// Publishable (anon) key is SAFE for browser use with RLS enabled
const SUPABASE_URL = 'https://kwdqyyslwyikijhvevsf.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt3ZHF5eXNsd3lpa2lqaHZldnNmIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDY3MzEwMSwiZXhwIjoyMDg2MjQ5MTAxfQ.ffohUD5hrqpIgO38KyD8WYAr6ic_QlRAAeDSiiUefZs';

// Initialize Supabase client (use different name to avoid conflict with library)
let supabaseClient = null;

// Check if Supabase JS library is loaded
function initSupabase() {
    if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        window.supabaseClient = supabaseClient;
        console.log('Supabase initialized successfully');
        return true;
    }
    console.warn('Supabase JS library not loaded');
    return false;
}

// Generate or get user ID (stored locally)
function getUserId() {
    // If logged in via wallet, use wallet address as user ID
    if (window.WalletAuth && window.WalletAuth.currentUser) {
        return window.WalletAuth.currentUser.wallet_address;
    }

    // Fallback to local generated ID
    let userId = localStorage.getItem('ritual_user_id');
    if (!userId) {
        userId = 'user_' + crypto.randomUUID();
        localStorage.setItem('ritual_user_id', userId);
    }
    return userId;
}

// XP System API
const XPSystem = {
    getLocalXP() {
        return parseInt(localStorage.getItem('ritual_total_xp')) || 0;
    },

    saveLocalXP(xp) {
        localStorage.setItem('ritual_total_xp', xp.toString());
    },

    async addXP(scoreXP, gameDuration = 0) {
        const userId = getUserId();
        const localStorageUserId = localStorage.getItem('ritual_user_id');
        const currentXP = this.getLocalXP();
        const newTotalXP = currentXP + scoreXP;

        this.saveLocalXP(newTotalXP);

        // Update local stats
        const localStats = this.getLocalStats();
        localStats.games_played = (localStats.games_played || 0) + 1;
        localStats.total_score = (localStats.total_score || 0) + scoreXP;
        localStats.time_played = (localStats.time_played || 0) + gameDuration;
        this.saveLocalStats(localStats);

        // Get nickname from WalletAuth if logged in
        let nickname = null;
        if (window.WalletAuth && window.WalletAuth.currentUser) {
            nickname = window.WalletAuth.currentUser.nickname;
        }

        // Try cloud sync
        if (supabaseClient) {
            try {
                // First, get current stats from cloud to merge
                let cloudStats = { games_played: 0, total_score: 0, time_played: 0 };
                try {
                    const { data: existingData } = await supabaseClient
                        .from('user_xp')
                        .select('games_played, total_score, time_played')
                        .eq('user_id', userId)
                        .maybeSingle();

                    if (existingData) {
                        cloudStats = {
                            games_played: existingData.games_played || 0,
                            total_score: existingData.total_score || 0,
                            time_played: existingData.time_played || 0
                        };
                    }
                } catch (e) {
                    // Columns might not exist yet, use local stats
                    console.log('Could not fetch existing stats, using local');
                }

                const upsertData = {
                    user_id: userId,
                    total_xp: newTotalXP,
                    updated_at: new Date().toISOString(),
                    // Increment stats
                    games_played: cloudStats.games_played + 1,
                    total_score: cloudStats.total_score + scoreXP,
                    time_played: cloudStats.time_played + gameDuration
                };

                // Add nickname if available
                if (nickname) {
                    upsertData.nickname = nickname;
                }

                let { data, error } = await supabaseClient
                    .from('user_xp')
                    .upsert(upsertData, { onConflict: 'user_id' })
                    .select();

                // If some columns don't exist, retry with only basic fields
                if (error && (error.code === 'PGRST204' || error.code === '42703' || error.message?.includes('column'))) {
                    console.log('Some columns not found, retrying with basic fields only');
                    const basicData = {
                        user_id: userId,
                        total_xp: newTotalXP,
                        updated_at: new Date().toISOString()
                    };
                    const result = await supabaseClient
                        .from('user_xp')
                        .upsert(basicData, { onConflict: 'user_id' })
                        .select();
                    data = result.data;
                    error = result.error;
                }

                if (error) {
                    console.error('Failed to sync XP to cloud:', error);
                } else {
                    console.log('XP synced to cloud:', data);
                }

                // Note: We no longer update old localStorage record with nickname
                // to avoid duplicate-looking entries in the leaderboard
            } catch (err) {
                console.error('XP sync exception:', err);
            }
        }

        return newTotalXP;
    },

    // Local stats management
    getLocalStats() {
        try {
            const stats = localStorage.getItem('ritual_stats');
            return stats ? JSON.parse(stats) : { games_played: 0, total_score: 0, time_played: 0 };
        } catch (e) {
            return { games_played: 0, total_score: 0, time_played: 0 };
        }
    },

    saveLocalStats(stats) {
        localStorage.setItem('ritual_stats', JSON.stringify(stats));
    },

    async syncFromCloud() {
        if (!supabaseClient) return this.getLocalXP();

        const userId = getUserId();

        try {
            const { data, error } = await supabaseClient
                .from('user_xp')
                .select('total_xp')
                .eq('user_id', userId)
                .maybeSingle();

            // Silently fallback to local if table doesn't exist or other errors
            if (error) {
                console.warn('Supabase sync error:', error.message);
                return this.getLocalXP();
            }

            if (data) {
                const cloudXP = data.total_xp;
                const localXP = this.getLocalXP();
                const maxXP = Math.max(cloudXP, localXP);
                this.saveLocalXP(maxXP);

                if (localXP > cloudXP) {
                    await supabaseClient
                        .from('user_xp')
                        .update({ total_xp: localXP, updated_at: new Date().toISOString() })
                        .eq('user_id', userId);
                }

                return maxXP;
            }

            return this.getLocalXP();
        } catch (err) {
            // Silent fallback
            return this.getLocalXP();
        }
    },

    async getLeaderboard(limit = 10) {
        if (!supabaseClient) {
            console.log('getLeaderboard: supabaseClient is null');
            return [];
        }

        try {
            // Try with all stats columns first
            let { data, error } = await supabaseClient
                .from('user_xp')
                .select('user_id, total_xp, updated_at, nickname, games_played, total_score, time_played')
                .order('total_xp', { ascending: false })
                .limit(limit);

            // If some columns don't exist, try with fewer columns
            if (error && (error.code === '42703' || error.message?.includes('column'))) {
                console.log('Some columns not found, trying with nickname only');
                const result = await supabaseClient
                    .from('user_xp')
                    .select('user_id, total_xp, updated_at, nickname')
                    .order('total_xp', { ascending: false })
                    .limit(limit);
                data = result.data;
                error = result.error;

                // If nickname doesn't exist either, try basic fields
                if (error && (error.code === '42703' || error.message?.includes('nickname'))) {
                    console.log('nickname column not found, fetching basic fields');
                    const basicResult = await supabaseClient
                        .from('user_xp')
                        .select('user_id, total_xp, updated_at')
                        .order('total_xp', { ascending: false })
                        .limit(limit);
                    data = basicResult.data;
                    error = basicResult.error;
                }
            }

            console.log('getLeaderboard result:', { data, error });

            if (error) {
                console.error('getLeaderboard error:', error);
                return [];
            }

            // Try to fetch nicknames from users table for wallet addresses
            if (data && data.length > 0) {
                const walletAddresses = data
                    .filter(item => item.user_id && item.user_id.startsWith('0x'))
                    .map(item => item.user_id.toLowerCase());

                if (walletAddresses.length > 0) {
                    try {
                        console.log('Fetching nicknames for wallets:', walletAddresses);
                        const { data: users, error: usersError } = await supabaseClient
                            .from('users')
                            .select('wallet_address, nickname')
                            .in('wallet_address', walletAddresses);

                        console.log('Users lookup result:', { users, usersError });

                        if (users) {
                            const nicknameMap = {};
                            users.forEach(u => {
                                nicknameMap[u.wallet_address] = u.nickname;
                            });
                            console.log('Nickname map:', nicknameMap);

                            // Merge nicknames into leaderboard data
                            data.forEach(item => {
                                if (!item.nickname && item.user_id) {
                                    item.nickname = nicknameMap[item.user_id.toLowerCase()];
                                }
                            });
                        }
                    } catch (e) {
                        console.warn('Failed to fetch nicknames:', e);
                    }
                }
            }

            return data || [];
        } catch (err) {
            console.error('getLeaderboard exception:', err);
            return [];
        }
    },

    // Get user's stats
    async getUserStats() {
        const userId = getUserId();
        const localStats = this.getLocalStats();
        const localXP = this.getLocalXP();

        // Default stats from local storage
        let stats = {
            games_played: localStats.games_played || 0,
            total_score: localStats.total_score || 0,
            time_played: localStats.time_played || 0,
            total_xp: localXP,
            avg_score: localStats.games_played > 0 ? Math.round(localStats.total_score / localStats.games_played) : 0
        };

        // Try to get from cloud
        if (supabaseClient) {
            try {
                const { data, error } = await supabaseClient
                    .from('user_xp')
                    .select('total_xp, games_played, total_score, time_played, nickname')
                    .eq('user_id', userId)
                    .maybeSingle();

                if (!error && data) {
                    stats = {
                        games_played: data.games_played || stats.games_played,
                        total_score: data.total_score || stats.total_score,
                        time_played: data.time_played || stats.time_played,
                        total_xp: data.total_xp || stats.total_xp,
                        nickname: data.nickname,
                        avg_score: (data.games_played > 0)
                            ? Math.round((data.total_score || 0) / data.games_played)
                            : stats.avg_score
                    };
                }
            } catch (err) {
                console.log('Could not fetch user stats from cloud:', err);
            }
        }

        return stats;
    },

    // Get user's position in leaderboard
    async getUserPosition() {
        if (!supabaseClient) return { position: null, total: 0 };

        const userId = getUserId();
        const localStorageUserId = localStorage.getItem('ritual_user_id');
        const userXP = this.getLocalXP();

        try {
            // Count users with more XP than current user
            const { count: above, error: aboveError } = await supabaseClient
                .from('user_xp')
                .select('*', { count: 'exact', head: true })
                .gt('total_xp', userXP);

            // Count total users
            const { count: total, error: totalError } = await supabaseClient
                .from('user_xp')
                .select('*', { count: 'exact', head: true });

            if (aboveError || totalError) {
                return { position: null, total: 0 };
            }

            return {
                position: (above || 0) + 1,
                total: total || 0,
                userId: userId,
                userXP: userXP
            };
        } catch (err) {
            return { position: null, total: 0 };
        }
    }
};

window.XPSystem = XPSystem;
window.initSupabase = initSupabase;
window.getUserId = getUserId;
