import { api } from "/scripts/api.js";

// Preview tooltip class
export class PreviewTooltip {
  constructor() {
    this.element = document.createElement('div');
    Object.assign(this.element.style, {
      position: 'fixed',
      zIndex: 9999,
      background: 'rgba(0, 0, 0, 0.85)',
      borderRadius: '6px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
      display: 'none',
      overflow: 'hidden',
      maxWidth: '300px',
      pointerEvents: 'none', // Prevent interference with autocomplete
    });
    document.body.appendChild(this.element);
    this.hideTimeout = null;
    this.isFromAutocomplete = false;
    
    // Modified event listeners for autocomplete compatibility
    this.globalClickHandler = (e) => {
      // Don't hide if click is on autocomplete dropdown
      if (!e.target.closest('.comfy-autocomplete-dropdown')) {
        this.hide();
      }
    };
    document.addEventListener('click', this.globalClickHandler);
    
    this.globalScrollHandler = () => this.hide();
    document.addEventListener('scroll', this.globalScrollHandler, true);
  }

  async show(loraName, x, y, fromAutocomplete = false) {
    try {
      // Clear previous hide timer
      if (this.hideTimeout) {
        clearTimeout(this.hideTimeout);
        this.hideTimeout = null;
      }

      // Track if this is from autocomplete
      this.isFromAutocomplete = fromAutocomplete;

      // Don't redisplay the same lora preview
      if (this.element.style.display === 'block' && this.currentLora === loraName) {
        this.position(x, y);
        return;
      }

      this.currentLora = loraName;
      
      // Get preview URL
      const response = await api.fetchApi(`/lm/loras/preview-url?name=${encodeURIComponent(loraName)}`, {
        method: 'GET'
      });

      if (!response.ok) {
        throw new Error('Failed to fetch preview URL');
      }

      const data = await response.json();
      if (!data.success || !data.preview_url) {
        throw new Error('No preview available');
      }

      // Clear existing content
      while (this.element.firstChild) {
        this.element.removeChild(this.element.firstChild);
      }

      // Create media container with relative positioning
      const mediaContainer = document.createElement('div');
      Object.assign(mediaContainer.style, {
        position: 'relative',
        maxWidth: '300px',
        maxHeight: '300px',
      });

      const isVideo = data.preview_url.endsWith('.mp4');
      const mediaElement = isVideo ? document.createElement('video') : document.createElement('img');

      Object.assign(mediaElement.style, {
        maxWidth: '300px',
        maxHeight: '300px',
        objectFit: 'contain',
        display: 'block',
      });

      if (isVideo) {
        mediaElement.autoplay = true;
        mediaElement.loop = true;
        mediaElement.muted = true;
        mediaElement.controls = false;
      }

      // Create name label with absolute positioning
      const nameLabel = document.createElement('div');
      nameLabel.textContent = loraName;
      Object.assign(nameLabel.style, {
        position: 'absolute',
        bottom: '0',
        left: '0',
        right: '0',
        padding: '8px',
        color: 'white',
        fontSize: '13px',
        fontFamily: "'Inter', 'Segoe UI', system-ui, -apple-system, sans-serif",
        background: 'linear-gradient(transparent, rgba(0, 0, 0, 0.8))',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        textAlign: 'center',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      });

      mediaContainer.appendChild(mediaElement);
      mediaContainer.appendChild(nameLabel);
      this.element.appendChild(mediaContainer);
      
      // Show element with opacity 0 first to get dimensions
      this.element.style.opacity = '0';
      this.element.style.display = 'block';
      
      // Wait for media to load before positioning
      const waitForLoad = () => {
        return new Promise((resolve) => {
          if (isVideo) {
            if (mediaElement.readyState >= 2) { // HAVE_CURRENT_DATA
              resolve();
            } else {
              mediaElement.addEventListener('loadeddata', resolve, { once: true });
              mediaElement.addEventListener('error', resolve, { once: true });
            }
          } else {
            if (mediaElement.complete) {
              resolve();
            } else {
              mediaElement.addEventListener('load', resolve, { once: true });
              mediaElement.addEventListener('error', resolve, { once: true });
            }
          }
          
          // Set a timeout to prevent hanging
          setTimeout(resolve, 1000);
        });
      };

      // Set source after setting up load listeners
      mediaElement.src = data.preview_url;
      
      // Wait for content to load, then position and show
      await waitForLoad();
      
      // Small delay to ensure layout is complete
      requestAnimationFrame(() => {
        this.position(x, y);
        this.element.style.transition = 'opacity 0.15s ease';
        this.element.style.opacity = '1';
      });
    } catch (error) {
      console.warn('Failed to load preview:', error);
    }
  }

  position(x, y) {
    // Ensure preview box doesn't exceed viewport boundaries
    const rect = this.element.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let left = x + 10; // Default 10px offset to the right of mouse
    let top = y + 10;  // Default 10px offset below mouse

    // Check right boundary
    if (left + rect.width > viewportWidth) {
      left = x - rect.width - 10;
    }

    // Check bottom boundary
    if (top + rect.height > viewportHeight) {
      top = y - rect.height - 10;
    }

    // Ensure minimum distance from edges
    left = Math.max(10, Math.min(left, viewportWidth - rect.width - 10));
    top = Math.max(10, Math.min(top, viewportHeight - rect.height - 10));

    Object.assign(this.element.style, {
      left: `${left}px`,
      top: `${top}px`
    });
  }

  hide() {
    // Use fade-out effect
    if (this.element.style.display === 'block') {
      this.element.style.opacity = '0';
      this.hideTimeout = setTimeout(() => {
        this.element.style.display = 'none';
        this.currentLora = null;
        this.isFromAutocomplete = false;
        // Stop video playback
        const video = this.element.querySelector('video');
        if (video) {
          video.pause();
        }
        this.hideTimeout = null;
      }, 150);
    }
  }

  cleanup() {
    if (this.hideTimeout) {
      clearTimeout(this.hideTimeout);
    }
    // Remove event listeners properly
    document.removeEventListener('click', this.globalClickHandler);
    document.removeEventListener('scroll', this.globalScrollHandler, true);
    this.element.remove();
  }
}



