export interface User {
  id: string;
  email: string;
  name: string;
  role: "student" | "teacher";
  avatar?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  role: "student" | "teacher";
}

export interface AuthResponse {
  access_token: string;
  refresh_token: string;
  user: User;
}
