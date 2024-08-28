import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Coupon } from '../entity/coupon.entity';

@Injectable()
export class CouponService {
  constructor(
    @InjectRepository(Coupon)
    private readonly couponRepository: Repository<Coupon>,
    private readonly dataSource: DataSource,
  ) {}

  // 1. 락을 걸지 않은 경우
  async assignCouponWithoutLock(
    userId: number,
  ): Promise<{ readCoupon: Coupon; saveCoupon: Coupon }> {
    const coupon = await this.couponRepository.findOne({
      where: { isRedeemed: false },
      order: { id: 'ASC' },
    });

    if (!coupon) {
      throw new Error('No available coupons');
    }

    coupon.isRedeemed = true;
    coupon.userId = userId;

    return {
      readCoupon: coupon,
      saveCoupon: await this.couponRepository.save(coupon),
    };
  }

  // 3. 비관적 읽기 락
  async assignCouponWithPessimisticReadLock(userId: number): Promise<{
    readCoupon?: Coupon;
    saveCoupon?: Coupon;
    error?: string;
  }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.startTransaction();

    let coupon;
    let saveCoupon;
    let error;

    try {
      coupon = await queryRunner.manager
        .createQueryBuilder(Coupon, 'coupon')
        .where('coupon.isRedeemed = :isRedeemed', { isRedeemed: false })
        .setLock('pessimistic_read')
        .orderBy('coupon.id', 'ASC')
        .getOne();

      if (!coupon) {
        throw new Error('No available coupons');
      }

      coupon.isRedeemed = true;
      coupon.userId = userId;

      saveCoupon = await queryRunner.manager.save(coupon);

      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      error = e.message;
    } finally {
      await queryRunner.release();

      return {
        readCoupon: coupon,
        saveCoupon,
        error,
      };
    }
  }

  // 4. 비관적 쓰기 락
  async assignCouponWithPessimisticWriteLock(userId: number): Promise<{
    readCoupon?: Coupon;
    saveCoupon?: Coupon;
    error?: string;
  }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.startTransaction();

    let coupon;
    let saveCoupon;
    let error;

    try {
      coupon = await queryRunner.manager
        .createQueryBuilder(Coupon, 'coupon')
        .where('coupon.isRedeemed = :isRedeemed', { isRedeemed: false })
        .setLock('pessimistic_write')
        .orderBy('coupon.id', 'ASC')
        .getOne();

      if (!coupon) {
        throw new Error('No available coupon');
      }

      coupon.isRedeemed = true;
      coupon.userId = userId;

      saveCoupon = await queryRunner.manager.save(coupon);

      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      error = e.message;
    } finally {
      await queryRunner.release();

      return {
        readCoupon: coupon,
        saveCoupon,
        error,
      };
    }
  }

  // 5. 비관적 쓰기 락 - No Wait
  async assignCouponWithPessimisticWriteLockNoWait(userId: number): Promise<{
    readCoupon?: Coupon;
    saveCoupon?: Coupon;
    error?: string;
  }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.startTransaction();

    let coupon;
    let saveCoupon;
    let error;

    try {
      coupon = await queryRunner.manager
        .createQueryBuilder(Coupon, 'coupon')
        .where('coupon.isRedeemed = :isRedeemed', { isRedeemed: false })
        .setLock('pessimistic_write')
        .setOnLocked('nowait')
        .orderBy('coupon.id', 'ASC')
        .getOne();

      if (!coupon) {
        throw new Error('No available coupon');
      }

      coupon.isRedeemed = true;
      coupon.userId = userId;

      saveCoupon = await queryRunner.manager.save(coupon);

      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      error = e.message;
    } finally {
      await queryRunner.release();

      return {
        readCoupon: coupon,
        saveCoupon,
        error,
      };
    }
  }

  // 6. 낙관적 락
  async assignCouponWithOptimisticLock(userId: number): Promise<{
    readCoupon?: Coupon;
    saveCoupon?: Coupon;
    error?: string;
  }> {
    const coupon = await this.couponRepository.findOne({
      where: { isRedeemed: false },
      order: { id: 'ASC' },
    });

    if (!coupon) {
      throw new Error('No available coupons');
    }

    const updateResult = await this.couponRepository.update(
      { id: coupon.id, version: coupon.version },
      { isRedeemed: true, userId },
    );

    if (updateResult.affected === 0) {
      return {
        readCoupon: coupon,
        error: 'Optimistic lock version mismatch',
      };
    }

    return {
      readCoupon: coupon,
      saveCoupon: await this.couponRepository.findOne({
        where: { id: coupon.id },
      }),
    };
  }

  // 1. SERIALIZABLE 격리 수준 트랜잭션
  async assignCouponWithSerializableIsolation(userId: number): Promise<{
    readCoupon?: Coupon;
    saveCoupon?: Coupon;
    error?: string;
  }> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.startTransaction('SERIALIZABLE');

    let coupon;
    let saveCoupon;
    let error;

    try {
      coupon = await queryRunner.manager
        .createQueryBuilder(Coupon, 'coupon')
        .where('coupon.isRedeemed = :isRedeemed', { isRedeemed: false })
        .orderBy('coupon.id', 'ASC')
        .getOne();

      if (!coupon) {
        throw new Error('No available coupons');
      }

      coupon.isRedeemed = true;
      coupon.userId = userId;

      saveCoupon = await queryRunner.manager.save(coupon);

      await queryRunner.commitTransaction();
    } catch (e) {
      await queryRunner.rollbackTransaction();
      error = e.message;
    } finally {
      await queryRunner.release();

      return {
        readCoupon: coupon,
        saveCoupon,
        error,
      };
    }
  }
}
