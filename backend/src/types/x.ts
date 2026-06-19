export type XTokenResponse = {
  token_type: string;
  expires_in?: number;
  access_token: string;
  refresh_token?: string;
  scope?: string;
};

export type XUser = {
  id: string;
  username: string;
  name?: string;
  profile_image_url?: string;
};

export type XPostMetrics = {
  retweet_count?: number;
  reply_count?: number;
  like_count?: number;
  quote_count?: number;
  bookmark_count?: number;
  impression_count?: number;
};

export type XPost = {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
  conversation_id?: string;
  in_reply_to_user_id?: string;
  referenced_tweets?: Array<{ type: "retweeted" | "quoted" | "replied_to"; id: string }>;
  attachments?: Record<string, unknown>;
  entities?: Record<string, unknown>;
  public_metrics?: XPostMetrics;
  organic_metrics?: XPostMetrics;
  non_public_metrics?: XPostMetrics;
};

export type XListResponse<T> = {
  data?: T[];
  meta?: {
    result_count?: number;
    newest_id?: string;
    oldest_id?: string;
    next_token?: string;
  };
  includes?: Record<string, unknown>;
  errors?: Array<Record<string, unknown>>;
};

export type XSingleResponse<T> = {
  data?: T;
  includes?: Record<string, unknown>;
  errors?: Array<Record<string, unknown>>;
};

