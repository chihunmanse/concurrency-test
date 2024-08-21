import { Entity, PrimaryGeneratedColumn, Column, OneToMany } from 'typeorm';
import { Coupon } from './coupon.entity';

@Entity()
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @OneToMany(() => Coupon, (coupon) => coupon.user)
  coupons: Coupon[];
}
