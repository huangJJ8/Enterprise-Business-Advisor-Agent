// import { PrismaClient, Prisma, User } from '@prisma/client';

// export type UserSelectListType = Omit<User, 'password' | 'password2'>;

// class UserSelect {
//   select: Record<keyof User, boolean> = {
//     id: true,
//     username: true,
//     pathname: true,
//     nickname: true,
//     email: true,
//     phone: true,
//     gender: true,
//     age: true,
//     state: true,
//     password: true,
//     password2: true,
//     localhostPassword: true,
//     localhostPasswordMessage: true,
//     picture: true,
//     level: true,
//     limitbytes: true,
//     usedbytes: true,
//     introduce: true,
//     createdAt: true,
//     updatedAt: true,
//   };

//   get home() {
//     const { id, pathname, nickname, gender, age, picture, introduce } =
//       this.select;
//     return {
//       id,
//       pathname,
//       nickname,
//       gender,
//       age,
//       picture,
//       introduce,
//     };
//   }
// }

// export const userSelect = new UserSelect();
