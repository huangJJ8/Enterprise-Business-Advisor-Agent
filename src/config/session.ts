import { SessionOptions } from 'iron-session';

export const sessionOptions: SessionOptions = {
  password: 'REPLACE_WITH_A_LONG_RANDOM_SECRET_AT_LEAST_32_CHARS',
  cookieName: 'note-user',
  cookieOptions: {
    // 阻止 JavaScript 通过 Document.cookie 属性访问 cookie。注意，设置了 HttpOnly 的 cookie 仍然会通过 JavaScript 发起的请求发送。其用于防范跨站脚本攻击（XSS）。
    httpOnly: true,
    // 控制 cookie 是否随跨站请求一起发送，这样可以在一定程度上防范跨站请求伪造攻击（CSRF）。
    // Lax 意味着 cookie 不会在跨站请求中被发送，
    sameSite: 'lax',
    // 存储路径
    path: '/',
    // 表示仅当请求通过 https: 协议（localhost 不受此限制）发送时才会将该 cookie 发送到服务器，因此其更能够抵抗中间人攻击。
    secure: process.env.NODE_ENV === 'production',
    //  如果maxAge为0或者负数,表示该Cookie写到客户端之后马上失效,通常用来删除Cookie。 如果maxAge为负数,表示该Cookie为临时性Cookie,
    maxAge: 7 * 12 * 60 * 60, // 单位为秒， 设置为7天
  },
};
