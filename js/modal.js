// GAMERO - Modal System JavaScript

const GameroModal = {
    overlay: null,
    currentResolve: null,
    progressInterval: null,
    
    init() {
        this.overlay = document.getElementById('customModal');
        
        // Click outside to close
        this.overlay.addEventListener('click', (e) => {
            if (e.target === this.overlay && !this.overlay.classList.contains('no-close')) {
                this.close();
            }
        });
        
        // ESC key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.overlay.classList.contains('active') && !this.overlay.classList.contains('no-close')) {
                this.close();
            }
        });
    },
    
    show(canClose = true) {
        this.overlay.classList.add('active');
        this.overlay.classList.remove('closing');
        if (!canClose) {
            this.overlay.classList.add('no-close');
        } else {
            this.overlay.classList.remove('no-close');
        }
    },
    
    close() {
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
            this.progressInterval = null;
        }
        
        this.overlay.classList.add('closing');
        setTimeout(() => {
            this.overlay.classList.remove('active', 'closing', 'no-close');
            this.resetModal();
        }, 300);
    },
    
    resetModal() {
        document.getElementById('modalIconContainer').style.display = 'block';
        document.getElementById('modalSpinnerContainer').style.display = 'none';
        document.getElementById('modalDotsContainer').style.display = 'none';
        document.getElementById('modalProgressContainer').style.display = 'none';
        document.getElementById('modalInputContainer').style.display = 'none';
    },
    
    alert(message, title = 'Alert', icon = '⚠️') {
        return new Promise((resolve) => {
            this.resetModal();
            document.getElementById('modalIcon').textContent = icon;
            document.getElementById('modalTitle').textContent = title;
            document.getElementById('modalMessage').textContent = message;
            document.getElementById('modalButtons').innerHTML = 
                '<button class="modal-btn modal-btn-primary" onclick="GameroModal.closeWithValue(true)">OK</button>';
            
            this.currentResolve = resolve;
            this.show();
        });
    },
    
    confirm(message, title = 'Confirm', icon = '❓') {
        return new Promise((resolve) => {
            this.resetModal();
            document.getElementById('modalIcon').textContent = icon;
            document.getElementById('modalTitle').textContent = title;
            document.getElementById('modalMessage').textContent = message;
            document.getElementById('modalButtons').innerHTML = 
                '<button class="modal-btn modal-btn-secondary" onclick="GameroModal.closeWithValue(false)">Cancel</button>' +
                '<button class="modal-btn modal-btn-success" onclick="GameroModal.closeWithValue(true)">Confirm</button>';
            
            this.currentResolve = resolve;
            this.show();
        });
    },
    
    success(message, title = 'Success!', icon = '✅') {
        return this.alert(message, title, icon);
    },
    
    error(message, title = 'Error', icon = '❌') {
        return this.alert(message, title, icon);
    },
    
    warning(message, title = 'Warning', icon = '⚠️') {
        return this.alert(message, title, icon);
    },
    
    info(message, title = 'Information', icon = 'ℹ️') {
        return this.alert(message, title, icon);
    },
    
    loading(message = 'Loading...', title = 'Please Wait') {
        this.resetModal();
        document.getElementById('modalIconContainer').style.display = 'none';
        document.getElementById('modalSpinnerContainer').style.display = 'block';
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalMessage').textContent = message;
        document.getElementById('modalButtons').innerHTML = '';
        
        this.show(false);
        
        return {
            close: () => this.close(),
            updateMessage: (msg) => {
                document.getElementById('modalMessage').textContent = msg;
            }
        };
    },
    
    loadingDots(message = 'Loading', title = 'Please Wait') {
        this.resetModal();
        document.getElementById('modalIconContainer').style.display = 'none';
        document.getElementById('modalDotsContainer').style.display = 'block';
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalMessage').textContent = message;
        document.getElementById('modalButtons').innerHTML = '';
        
        this.show(false);
        
        return {
            close: () => this.close(),
            updateMessage: (msg) => {
                document.getElementById('modalMessage').textContent = msg;
            }
        };
    },
    
    progress(message = 'Processing...', title = 'Progress') {
        this.resetModal();
        document.getElementById('modalIconContainer').style.display = 'none';
        document.getElementById('modalProgressContainer').style.display = 'block';
        document.getElementById('modalTitle').textContent = title;
        document.getElementById('modalMessage').textContent = message;
        document.getElementById('modalButtons').innerHTML = '';
        
        this.show(false);
        
        return {
            close: () => this.close(),
            setProgress: (percent) => {
                document.getElementById('modalProgressBar').style.width = percent + '%';
                document.getElementById('modalProgressText').textContent = Math.round(percent) + '%';
            },
            updateMessage: (msg) => {
                document.getElementById('modalMessage').textContent = msg;
            }
        };
    },
    
    autoProgress(message = 'Loading...', title = 'Please Wait', duration = 3000) {
        const modal = this.progress(message, title);
        let percent = 0;
        const increment = 100 / (duration / 50);
        
        this.progressInterval = setInterval(() => {
            percent += increment;
            if (percent >= 100) {
                percent = 100;
                modal.setProgress(100);
                clearInterval(this.progressInterval);
                setTimeout(() => modal.close(), 500);
            } else {
                modal.setProgress(percent);
            }
        }, 50);
        
        return modal;
    },
    
    closeWithValue(value) {
        if (this.currentResolve) {
            this.currentResolve(value);
            this.currentResolve = null;
        }
        this.close();
    }
};

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
    GameroModal.init();
});
