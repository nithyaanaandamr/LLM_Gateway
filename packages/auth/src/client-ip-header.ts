// Header the admin API sets from the real client IP; Better Auth reads the rate-limit IP only from here
// see PITFALLS.md: Auth rate limit needs the real client IP
export const CLIENT_IP_HEADER = "x-gw-client-ip";
