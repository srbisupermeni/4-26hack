/**
 * API request utility with JWT token management.
 */

const API_BASE = '/api';

interface RequestOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
}

class ApiClient {
  private token: string | null = null;

  constructor() {
    // Load token from localStorage
    this.token = localStorage.getItem('vstandby_token');
  }

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('vstandby_token', token);
    } else {
      localStorage.removeItem('vstandby_token');
    }
  }

  getToken(): string | null {
    return this.token;
  }

  private async request<T>(endpoint: string, options: RequestOptions = {}): Promise<T> {
    const { method = 'GET', body, headers = {} } = options;

    const requestHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...headers,
    };

    if (this.token) {
      requestHeaders['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${API_BASE}${endpoint}`, {
      method,
      headers: requestHeaders,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ detail: 'Request failed' }));
      throw new Error(error.detail || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Auth endpoints
  async register(email: string, password: string, nickname?: string) {
    const data = await this.request<any>('/auth/register', {
      method: 'POST',
      body: { email, password, nickname },
    });
    this.setToken(data.access_token);
    return data;
  }

  async login(email: string, password: string) {
    const data = await this.request<any>('/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    this.setToken(data.access_token);
    return data;
  }

  async googleAuth(credential: string) {
    const data = await this.request<any>('/auth/google', {
      method: 'POST',
      body: { credential },
    });
    this.setToken(data.access_token);
    return data;
  }

  async getMe() {
    return this.request<any>('/auth/me');
  }

  async updateProfile(data: { nickname?: string; avatar_url?: string }) {
    return this.request<any>('/auth/profile', {
      method: 'PUT',
      body: data,
    });
  }

  async logout() {
    this.setToken(null);
  }

  // User preferences
  async getPreferences() {
    return this.request<any>('/user/preferences');
  }

  async updatePreferences(preferences: {
    favorite_teams?: string[];
    favorite_players?: string[];
    preferred_persona?: string;
    tts_enabled?: boolean;
    language?: string;
  }) {
    return this.request<any>('/user/preferences', {
      method: 'PUT',
      body: preferences,
    });
  }

  // Watch history
  async getHistory(limit = 50) {
    return this.request<any>(`/user/history?limit=${limit}`);
  }

  async addHistory(data: { game_id?: string; sport?: string; watch_duration?: number }) {
    return this.request<any>('/user/history', {
      method: 'POST',
      body: data,
    });
  }
}

export const api = new ApiClient();
