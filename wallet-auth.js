// Wallet Authentication System
// Supports MetaMask and any EVM-compatible wallet

const WalletAuth = {
    currentUser: null,
    isConnecting: false,

    // Check if wallet is available
    isWalletAvailable() {
        return typeof window.ethereum !== 'undefined';
    },

    // Get current connected address
    async getConnectedAddress() {
        if (!this.isWalletAvailable()) return null;

        try {
            const accounts = await window.ethereum.request({ method: 'eth_accounts' });
            return accounts[0] || null;
        } catch (err) {
            console.error('Failed to get accounts:', err);
            return null;
        }
    },

    // Connect wallet
    async connectWallet() {
        if (this.isConnecting) return null;
        this.isConnecting = true;

        try {
            if (!this.isWalletAvailable()) {
                throw new Error('No wallet found. Please install MetaMask or another Web3 wallet.');
            }

            // Request account access
            const accounts = await window.ethereum.request({
                method: 'eth_requestAccounts'
            });

            if (!accounts || accounts.length === 0) {
                throw new Error('No accounts found');
            }

            const walletAddress = accounts[0].toLowerCase();
            console.log('Wallet connected:', walletAddress);

            // Check if user exists in database
            const existingUser = await this.getUserByWallet(walletAddress);

            if (existingUser) {
                // Existing user - restore session
                this.currentUser = existingUser;
                this.saveSession(existingUser);
                this.onAuthSuccess(existingUser, false);
                return existingUser;
            } else {
                // New user - show registration modal
                this.showRegistrationModal(walletAddress);
                return null;
            }

        } catch (err) {
            console.error('Wallet connection failed:', err);
            this.onAuthError(err.message);
            return null;
        } finally {
            this.isConnecting = false;
        }
    },

    // Get user by wallet from Supabase
    async getUserByWallet(walletAddress) {
        if (!supabaseClient) {
            console.warn('Supabase not initialized');
            return null;
        }

        try {
            const { data, error } = await supabaseClient
                .from('users')
                .select('*')
                .eq('wallet_address', walletAddress.toLowerCase())
                .maybeSingle();

            if (error) {
                console.error('Database error:', error);
                return null;
            }

            return data || null;
        } catch (err) {
            console.error('Failed to get user:', err);
            return null;
        }
    },

    // Register new user
    async registerUser(walletAddress, nickname) {
        if (!supabaseClient) {
            // Fallback: save locally
            const user = {
                id: 'local_' + Date.now(),
                wallet_address: walletAddress.toLowerCase(),
                nickname: nickname,
                total_xp: 0,
                created_at: new Date().toISOString()
            };
            this.currentUser = user;
            this.saveSession(user);
            return user;
        }

        try {
            const { data, error } = await supabaseClient
                .from('users')
                .insert({
                    wallet_address: walletAddress.toLowerCase(),
                    nickname: nickname,
                    total_xp: 0
                })
                .select()
                .single();

            if (error) {
                throw error;
            }

            this.currentUser = data;
            this.saveSession(data);
            return data;
        } catch (err) {
            console.error('Registration failed:', err);
            throw err;
        }
    },

    // Update user XP
    async updateUserXP(xpToAdd) {
        if (!this.currentUser) return;

        const newXP = (this.currentUser.total_xp || 0) + xpToAdd;
        this.currentUser.total_xp = newXP;
        this.saveSession(this.currentUser);

        // Also update localStorage XP for game.js compatibility
        localStorage.setItem('ritual_total_xp', newXP.toString());

        if (supabaseClient && this.currentUser.id && !this.currentUser.id.startsWith('local_')) {
            try {
                await supabaseClient
                    .from('users')
                    .update({
                        total_xp: newXP,
                        updated_at: new Date().toISOString()
                    })
                    .eq('id', this.currentUser.id);
            } catch (err) {
                console.error('Failed to update XP in cloud:', err);
            }
        }

        return newXP;
    },

    // Save session to localStorage
    saveSession(user) {
        localStorage.setItem('ritual_user', JSON.stringify(user));
        localStorage.setItem('ritual_total_xp', (user.total_xp || 0).toString());
    },

    // Load session from localStorage
    loadSession() {
        try {
            const userData = localStorage.getItem('ritual_user');
            if (userData) {
                this.currentUser = JSON.parse(userData);
                return this.currentUser;
            }
        } catch (err) {
            console.error('Failed to load session:', err);
        }
        return null;
    },

    // Logout
    logout() {
        this.currentUser = null;
        localStorage.removeItem('ritual_user');
        this.hideUserInfo();
        this.showConnectButton();
        this.hideGameUI();
        if (typeof updateRankDisplay === 'function') {
            updateRankDisplay();
        }
    },

    // Show registration modal
    showRegistrationModal(walletAddress) {
        const modal = document.getElementById('authModal');
        const nicknameInput = document.getElementById('authNickname');
        const walletDisplay = document.getElementById('authWalletAddress');
        const registerBtn = document.getElementById('authRegisterBtn');
        const errorEl = document.getElementById('authError');

        if (!modal) {
            console.error('Auth modal not found');
            return;
        }

        // Show wallet address (shortened)
        if (walletDisplay) {
            walletDisplay.textContent = walletAddress.slice(0, 6) + '...' + walletAddress.slice(-4);
        }

        // Clear previous state
        if (nicknameInput) nicknameInput.value = '';
        if (errorEl) errorEl.style.display = 'none';

        modal.style.display = 'flex';

        // Handle registration
        const handleRegister = async () => {
            const nickname = nicknameInput.value.trim();

            if (!nickname || nickname.length < 2) {
                if (errorEl) {
                    errorEl.textContent = 'Nickname must be at least 2 characters';
                    errorEl.style.display = 'block';
                }
                return;
            }

            if (nickname.length > 20) {
                if (errorEl) {
                    errorEl.textContent = 'Nickname must be 20 characters or less';
                    errorEl.style.display = 'block';
                }
                return;
            }

            try {
                registerBtn.disabled = true;
                registerBtn.textContent = 'Registering...';

                const user = await this.registerUser(walletAddress, nickname);
                modal.style.display = 'none';
                this.onAuthSuccess(user, true);

            } catch (err) {
                if (errorEl) {
                    errorEl.textContent = err.message || 'Registration failed';
                    errorEl.style.display = 'block';
                }
            } finally {
                registerBtn.disabled = false;
                registerBtn.textContent = 'Register';
            }
        };

        // Remove old listener and add new one
        const newBtn = registerBtn.cloneNode(true);
        registerBtn.parentNode.replaceChild(newBtn, registerBtn);
        newBtn.addEventListener('click', handleRegister);

        // Enter key support
        if (nicknameInput) {
            nicknameInput.onkeydown = (e) => {
                if (e.key === 'Enter') handleRegister();
            };
        }
    },

    // Close auth modal
    closeAuthModal() {
        const modal = document.getElementById('authModal');
        if (modal) modal.style.display = 'none';
    },

    // On successful auth
    onAuthSuccess(user, isNewUser) {
        console.log('Auth success:', user.nickname, isNewUser ? '(new)' : '(existing)');

        // Update UI
        this.showUserInfo(user);
        this.hideConnectButton();

        // Show game UI (Start button, etc.)
        this.showGameUI();

        // Sync XP
        if (user.total_xp) {
            localStorage.setItem('ritual_total_xp', user.total_xp.toString());
        }

        // Update rank display
        if (typeof updateRankDisplay === 'function') {
            updateRankDisplay();
        }

        // Show welcome message for new users
        if (isNewUser) {
            this.showNotification(`Welcome, ${user.nickname}!`);
        } else {
            this.showNotification(`Welcome back, ${user.nickname}!`);
        }
    },

    // On auth error
    onAuthError(message) {
        this.showNotification(message, 'error');
    },

    // Show user info in menu
    showUserInfo(user) {
        const userInfo = document.getElementById('userInfo');
        const userName = document.getElementById('userName');
        const userXP = document.getElementById('userXP');

        if (userInfo) userInfo.style.display = 'flex';
        if (userName) userName.textContent = user.nickname;
        if (userXP) userXP.textContent = (user.total_xp || 0).toLocaleString() + ' XP';
    },

    // Hide user info
    hideUserInfo() {
        const userInfo = document.getElementById('userInfo');
        if (userInfo) userInfo.style.display = 'none';
    },

    // Show connect button
    showConnectButton() {
        const connectBtn = document.getElementById('connectWalletBtn');
        if (connectBtn) connectBtn.style.display = 'flex';
    },

    // Hide connect button
    hideConnectButton() {
        const connectBtn = document.getElementById('connectWalletBtn');
        if (connectBtn) connectBtn.style.display = 'none';
    },

    // Show game UI (when logged in)
    showGameUI() {
        const authRequired = document.getElementById('authRequired');
        const startBtn = document.getElementById('startBtn');
        const bestScoreSection = document.getElementById('bestScoreSection');
        const menuRankBtn = document.getElementById('menuRankBtn');

        if (authRequired) authRequired.style.display = 'none';
        if (startBtn) startBtn.style.display = 'block';
        if (bestScoreSection) bestScoreSection.style.display = 'block';
        if (menuRankBtn) menuRankBtn.style.display = 'flex';
    },

    // Hide game UI (when logged out)
    hideGameUI() {
        const authRequired = document.getElementById('authRequired');
        const startBtn = document.getElementById('startBtn');
        const bestScoreSection = document.getElementById('bestScoreSection');
        const menuRankBtn = document.getElementById('menuRankBtn');

        if (authRequired) authRequired.style.display = 'block';
        if (startBtn) startBtn.style.display = 'none';
        if (bestScoreSection) bestScoreSection.style.display = 'none';
        if (menuRankBtn) menuRankBtn.style.display = 'none';
    },

    // Show notification
    showNotification(message, type = 'success') {
        const notification = document.createElement('div');
        notification.className = 'wallet-notification ' + type;
        notification.textContent = message;
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 10);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => notification.remove(), 300);
        }, 3000);
    },

    // Initialize
    async init() {
        // Check for existing session
        const savedUser = this.loadSession();

        if (savedUser) {
            // Verify wallet is still connected
            const currentAddress = await this.getConnectedAddress();

            if (currentAddress && currentAddress.toLowerCase() === savedUser.wallet_address) {
                this.currentUser = savedUser;
                this.showUserInfo(savedUser);
                this.hideConnectButton();
                this.showGameUI();

                // Sync with cloud
                if (supabaseClient && savedUser.id && !savedUser.id.startsWith('local_')) {
                    const cloudUser = await this.getUserByWallet(savedUser.wallet_address);
                    if (cloudUser && cloudUser.total_xp > savedUser.total_xp) {
                        this.currentUser = cloudUser;
                        this.saveSession(cloudUser);
                        this.showUserInfo(cloudUser);
                    }
                }
            } else {
                // Wallet disconnected - clear session
                this.logout();
            }
        } else {
            // No session - ensure game UI is hidden
            this.hideGameUI();
        }

        // Listen for account changes
        if (this.isWalletAvailable()) {
            window.ethereum.on('accountsChanged', (accounts) => {
                if (accounts.length === 0) {
                    this.logout();
                } else if (this.currentUser &&
                           accounts[0].toLowerCase() !== this.currentUser.wallet_address) {
                    // Different account connected
                    this.logout();
                    this.connectWallet();
                }
            });
        }
    }
};

// Export
window.WalletAuth = WalletAuth;

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    WalletAuth.init();
});
