export interface UserProfile {
  id: string;
  name: string;
  email: string;
  role: "student" | "teacher";
  avatar?: string;
  created_at: string;
}

export interface UpdateProfileRequest {
  name?: string;
  avatar?: string;
}
