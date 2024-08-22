import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  VersionColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity()
export class Coupon {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  code: string;

  @Column({ default: false })
  isRedeemed: boolean;

  @ManyToOne(() => User, (user) => user.coupons, { nullable: true })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'id' })
  user: User;

  @Column({ name: 'user_id', nullable: true })
  userId: number;

  @VersionColumn()
  version: number;
}
