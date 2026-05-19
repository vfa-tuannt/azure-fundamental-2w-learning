import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';

export interface GoogleProfileInput {
  email: string;
  name: string;
  avatarUrl: string | null;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  findByEmail(email: string): Promise<User | null> {
    return this.users.findOne({ where: { email } });
  }

  findById(id: string): Promise<User | null> {
    return this.users.findOne({ where: { id } });
  }

  async upsertFromGoogleProfile(profile: GoogleProfileInput): Promise<User> {
    const existing = await this.findByEmail(profile.email);
    if (existing) {
      existing.name = profile.name;
      existing.avatarUrl = profile.avatarUrl;
      return this.users.save(existing);
    }
    const created = this.users.create({
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
    });
    return this.users.save(created);
  }
}
