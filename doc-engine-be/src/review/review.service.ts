import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { ReviewGrade, SavedWord, WordGroup } from '../contracts';
import { Store } from '../store/store';
import { nextReview } from './srs';

export interface SaveWordInput {
  word: string;
  meaning: string;
  ipa?: string;
  example?: string;
  groupIds?: string[];
}

export interface WordFilter {
  /** Chỉ lấy từ thuộc nhóm này. */
  groupId?: string;
  /** Tìm theo từ hoặc nghĩa, không phân biệt hoa thường và dấu. */
  search?: string;
}

export interface QuizQuestion {
  wordId: string;
  prompt: string;
  options: string[];
  answer: number;
}

const MAX_GROUPS = 50;
const MAX_GROUP_NAME = 40;

const fold = (value: string): string =>
  value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/gi, 'd')
    .toLowerCase()
    .trim();

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

@Injectable()
export class ReviewService {
  constructor(private readonly store: Store) {}

  async list(userId: string, filter: WordFilter = {}): Promise<SavedWord[]> {
    const data = await this.store.read(userId);
    const search = filter.search ? fold(filter.search) : '';
    return data.savedWords.filter(
      word =>
        (!filter.groupId || word.groupIds.includes(filter.groupId)) &&
        (!search || fold(word.word).includes(search) || fold(word.meaning).includes(search)),
    );
  }

  /** Từ đến hạn ôn, có thể giới hạn trong một nhóm. Từ nào hết hạn lâu nhất đứng trước. */
  async due(userId: string, groupId?: string, now = new Date()): Promise<SavedWord[]> {
    return (await this.list(userId, { groupId }))
      .filter(word => new Date(word.dueAt) <= now)
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  }

  async summary(userId: string, now = new Date()): Promise<{ saved: number; due: number }> {
    const [saved, due] = await Promise.all([this.list(userId), this.due(userId, undefined, now)]);
    return { saved: saved.length, due: due.length };
  }

  async save(userId: string, input: SaveWordInput): Promise<SavedWord> {
    return this.store.update(userId, data => {
      const groupIds = this.checkGroups(data.groups, input.groupIds ?? []);
      // Lưu lại một từ đã có thì giữ nguyên tiến độ ôn, chỉ bổ sung các nhóm mới.
      const existing = data.savedWords.find(
        saved => saved.word.toLowerCase() === input.word.toLowerCase(),
      );
      if (existing) {
        existing.groupIds = [...new Set([...existing.groupIds, ...groupIds])];
        return existing;
      }
      const now = new Date().toISOString();
      const created: SavedWord = {
        id: randomUUID(),
        word: input.word,
        meaning: input.meaning,
        ipa: input.ipa,
        example: input.example,
        groupIds,
        box: 0,
        dueAt: now,
        addedAt: now,
      };
      data.savedWords.push(created);
      return created;
    });
  }

  async grade(userId: string, id: string, grade: ReviewGrade, now = new Date()): Promise<SavedWord> {
    return this.store.update(userId, data => {
      const word = this.findWord(data.savedWords, id);
      Object.assign(word, nextReview(word.box, grade, now), {
        lastReviewedAt: now.toISOString(),
      });
      return word;
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.store.update(userId, data => {
      const index = data.savedWords.findIndex(saved => saved.id === id);
      if (index === -1) {
        throw new NotFoundException(`Không có từ ${id}`);
      }
      data.savedWords.splice(index, 1);
    });
  }

  /** Đặt lại toàn bộ nhóm của một từ. */
  async setWordGroups(userId: string, id: string, groupIds: string[]): Promise<SavedWord> {
    return this.store.update(userId, data => {
      const word = this.findWord(data.savedWords, id);
      word.groupIds = this.checkGroups(data.groups, groupIds);
      return word;
    });
  }

  async groups(userId: string): Promise<(WordGroup & { count: number; due: number })[]> {
    const data = await this.store.read(userId);
    const now = new Date();
    return data.groups.map(group => {
      const members = data.savedWords.filter(word => word.groupIds.includes(group.id));
      return {
        ...group,
        count: members.length,
        due: members.filter(word => new Date(word.dueAt) <= now).length,
      };
    });
  }

  async createGroup(userId: string, rawName: string): Promise<WordGroup> {
    const name = rawName.trim();
    if (!name) {
      throw new BadRequestException('Tên nhóm không được để trống.');
    }
    if (name.length > MAX_GROUP_NAME) {
      throw new BadRequestException(`Tên nhóm tối đa ${MAX_GROUP_NAME} ký tự.`);
    }
    return this.store.update(userId, data => {
      if (data.groups.length >= MAX_GROUPS) {
        throw new BadRequestException(`Tối đa ${MAX_GROUPS} nhóm.`);
      }
      if (data.groups.some(group => fold(group.name) === fold(name))) {
        throw new BadRequestException('Đã có nhóm trùng tên này.');
      }
      const group: WordGroup = { id: randomUUID(), name, createdAt: new Date().toISOString() };
      data.groups.push(group);
      return group;
    });
  }

  async renameGroup(userId: string, id: string, rawName: string): Promise<WordGroup> {
    const name = rawName.trim();
    if (!name || name.length > MAX_GROUP_NAME) {
      throw new BadRequestException(`Tên nhóm cần từ 1 đến ${MAX_GROUP_NAME} ký tự.`);
    }
    return this.store.update(userId, data => {
      const group = data.groups.find(item => item.id === id);
      if (!group) {
        throw new NotFoundException(`Không có nhóm ${id}`);
      }
      if (data.groups.some(item => item.id !== id && fold(item.name) === fold(name))) {
        throw new BadRequestException('Đã có nhóm trùng tên này.');
      }
      group.name = name;
      return group;
    });
  }

  /** Xoá nhóm nhưng giữ nguyên các từ, chỉ gỡ chúng khỏi nhóm. */
  async deleteGroup(userId: string, id: string): Promise<void> {
    await this.store.update(userId, data => {
      const index = data.groups.findIndex(item => item.id === id);
      if (index === -1) {
        throw new NotFoundException(`Không có nhóm ${id}`);
      }
      data.groups.splice(index, 1);
      for (const word of data.savedWords) {
        word.groupIds = word.groupIds.filter(groupId => groupId !== id);
      }
    });
  }

  /**
   * Tạo bài trắc nghiệm chọn nghĩa. Đáp án sai lấy từ các từ khác trong thư viện của người dùng
   * (ưu tiên cùng nhóm), nên cần ít nhất 2 từ.
   */
  async quiz(userId: string, groupId: string | undefined, count: number): Promise<QuizQuestion[]> {
    const pool = await this.list(userId, { groupId });
    if (pool.length < 2) {
      throw new BadRequestException('Cần ít nhất 2 từ để làm trắc nghiệm.');
    }
    return shuffle(pool)
      .slice(0, count)
      .map(word => {
        const others = shuffle(pool.filter(other => other.id !== word.id && other.meaning !== word.meaning));
        const options = shuffle([word.meaning, ...others.slice(0, 3).map(other => other.meaning)]);
        return { wordId: word.id, prompt: word.word, options, answer: options.indexOf(word.meaning) };
      });
  }

  private findWord(words: SavedWord[], id: string): SavedWord {
    const word = words.find(saved => saved.id === id);
    if (!word) {
      throw new NotFoundException(`Không có từ ${id}`);
    }
    return word;
  }

  private checkGroups(groups: WordGroup[], groupIds: string[]): string[] {
    const unique = [...new Set(groupIds)];
    const unknown = unique.find(id => !groups.some(group => group.id === id));
    if (unknown) {
      throw new BadRequestException(`Không có nhóm ${unknown}`);
    }
    return unique;
  }
}
