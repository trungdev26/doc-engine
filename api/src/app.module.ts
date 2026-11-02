import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthController } from './auth/auth.controller';
import { AuthGuard } from './auth/auth.guard';
import { RateLimitGuard } from './auth/rate-limit.guard';
import { AuthService } from './auth/auth.service';
import { FileUsers } from './auth/file-users';
import { PgUsers } from './auth/pg-users';
import { UsersRepository } from './auth/users.repository';
import { AdminContentController } from './content/admin.controller';
import { ContentRepository } from './content/content.repository';
import { FileContent } from './content/file.content';
import { PgContent } from './content/pg.content';
import { DictionaryController } from './dictionary/dictionary.controller';
import { DictionarySyncService } from './dictionary/dictionary-sync.service';
import { DictionaryService } from './dictionary/dictionary.service';
import {
  DictionaryStore,
  MemoryDictionaryStore,
  PgDictionaryStore,
} from './dictionary/dictionary.store';
import { LearningController } from './learning/learning.controller';
import { LearningService } from './learning/learning.service';
import { ReviewController } from './review/review.controller';
import { ReviewService } from './review/review.service';
import { JsonFileStore } from './store/json-file.store';
import { PgPoolService, createPgPool } from './store/pg.pool';
import { PgStore } from './store/pg.store';
import { Store } from './store/store';

@Module({
  controllers: [
    LearningController,
    ReviewController,
    AdminContentController,
    AuthController,
    DictionaryController,
  ],
  providers: [
    {
      provide: PgPoolService,
      // Chỉ tạo pool khi có DATABASE_URL (Neon); không thì API chạy bằng file JSON và bài mẫu.
      useFactory: (): PgPoolService | null =>
        process.env.DATABASE_URL ? new PgPoolService(createPgPool(process.env.DATABASE_URL)) : null,
    },
    {
      provide: Store,
      inject: [PgPoolService],
      useFactory: (pg: PgPoolService | null): Store =>
        pg ? new PgStore(pg.pool) : new JsonFileStore(),
    },
    {
      provide: ContentRepository,
      inject: [PgPoolService],
      useFactory: async (pg: PgPoolService | null): Promise<ContentRepository> => {
        if (!pg) return new FileContent();
        const content = new PgContent(pg.pool);
        await content.ensureSchema();
        return content;
      },
    },
    {
      provide: UsersRepository,
      inject: [PgPoolService],
      useFactory: async (pg: PgPoolService | null): Promise<UsersRepository> => {
        if (!pg) return new FileUsers();
        const users = new PgUsers(pg.pool);
        await users.ensureSchema();
        return users;
      },
    },
    {
      provide: DictionaryStore,
      inject: [PgPoolService],
      useFactory: async (pg: PgPoolService | null): Promise<DictionaryStore> => {
        if (!pg) return new MemoryDictionaryStore();
        const store = new PgDictionaryStore(pg.pool);
        await store.ensureSchema();
        return store;
      },
    },
    AuthService,
    DictionaryService,
    DictionarySyncService,
    LearningService,
    ReviewService,
    // Thứ tự đăng ký là thứ tự chạy: giới hạn tần suất trước, rồi mới kiểm tra đăng nhập.
    { provide: APP_GUARD, useClass: RateLimitGuard },
    // Mặc định mọi endpoint cần đăng nhập; endpoint công khai phải đánh dấu @Public().
    { provide: APP_GUARD, useClass: AuthGuard },
  ],
})
export class AppModule {}
