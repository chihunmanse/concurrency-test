import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { CouponService } from '../../coupon/coupon.service';
import { Coupon } from '../../entity/coupon.entity';
import { User } from '../../entity/user.entity';
import { DataSource, Repository } from 'typeorm';

describe('Lock', () => {
  let couponService: CouponService;
  let dataSource: DataSource;
  let couponRepository: Repository<Coupon>;
  let userRepository: Repository<User>;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'mysql',
          host: 'localhost',
          port: 3306,
          username: 'local',
          password: 'localpass',
          database: 'test-db',
          entities: [Coupon, User],
          synchronize: true,
          logging: ['query'],
        }),
        TypeOrmModule.forFeature([Coupon, User]),
      ],
      providers: [CouponService],
    }).compile();

    couponService = module.get<CouponService>(CouponService);
    dataSource = module.get<DataSource>(DataSource);
    couponRepository = module.get<Repository<Coupon>>(
      getRepositoryToken(Coupon),
    );
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
  });

  beforeEach(async () => {
    await couponRepository.delete({});
    await userRepository.delete({});
  });

  afterAll(async () => {
    await dataSource.destroy();
  });

  describe('Without Lock', () => {
    it('should handle concurrent requests without locks', async () => {
      const user1 = await userRepository.save({ name: 'user1' });
      const user2 = await userRepository.save({ name: 'user2' });
      await couponRepository.save({ code: 'WITHOUT_LOCK_COUPON' });

      const result1Promise = couponService.assignCouponWithoutLock(user1.id);
      const result2Promise = couponService.assignCouponWithoutLock(user2.id);

      const [result1, result2] = await Promise.all([
        result1Promise,
        result2Promise,
      ]);

      expect(result1.readCoupon.code).toBe('WITHOUT_LOCK_COUPON');
      expect(result2.readCoupon.code).toBe('WITHOUT_LOCK_COUPON');
      expect(result1.saveCoupon.code).toBe('WITHOUT_LOCK_COUPON');
      expect(result2.saveCoupon.code).toBe('WITHOUT_LOCK_COUPON');
      expect(result1.saveCoupon.userId).toBe(user1.id);
      expect(result2.saveCoupon.userId).toBe(user2.id);
    });
  });

  describe('Pessimistic Read Lock', () => {
    it('should handle concurrent requests with pessimistic read lock', async () => {
      const user1 = await userRepository.save({ name: 'user1' });
      const user2 = await userRepository.save({ name: 'user2' });
      await couponRepository.save({ code: 'PESSIMISTIC_READ_LOCK_COUPON' });

      const result1Promise = couponService.assignCouponWithPessimisticReadLock(
        user1.id,
      );
      const result2Promise = couponService.assignCouponWithPessimisticReadLock(
        user2.id,
      );

      const [result1, result2] = await Promise.all([
        result1Promise,
        result2Promise,
      ]);

      // 쿠폰 읽기는 가능하지만 쓰기는 불가하므로 하나의 쿠폰만 업데이트 됨
      expect(result1.readCoupon.code).toBe('PESSIMISTIC_READ_LOCK_COUPON');
      expect(result2.readCoupon.code).toBe('PESSIMISTIC_READ_LOCK_COUPON');
      if (result1.saveCoupon) {
        expect(result1.saveCoupon.code).toBe('PESSIMISTIC_READ_LOCK_COUPON');
        expect(result1.saveCoupon.userId).toBe(user1.id);
        expect(result2.saveCoupon).toBeUndefined();
        expect(result2.error).toBe(
          'Deadlock found when trying to get lock; try restarting transaction',
        );
      } else {
        expect(result2.saveCoupon.code).toBe('PESSIMISTIC_READ_LOCK_COUPON');
        expect(result2.saveCoupon.userId).toBe(user2.id);
        expect(result1.saveCoupon).toBeUndefined();
        expect(result1.error).toBe(
          'Deadlock found when trying to get lock; try restarting transaction',
        );
      }
    });
  });

  describe('Pessimistic Write Lock', () => {
    it('should handle concurrent requests with pessimistic wite lock', async () => {
      const user1 = await userRepository.save({ name: 'user1' });
      const user2 = await userRepository.save({ name: 'user2' });
      await couponRepository.save({
        code: 'PESSIMISTIC_WRITE_LOCK_COUPON',
      });

      const result1Promise = couponService.assignCouponWithPessimisticWriteLock(
        user1.id,
      );
      const result2Promise = couponService.assignCouponWithPessimisticWriteLock(
        user2.id,
      );

      const [result1, result2] = await Promise.all([
        result1Promise,
        result2Promise,
      ]);

      // 쿠폰 읽기도 불가
      if (result1.saveCoupon) {
        expect(result1.readCoupon.code).toBe('PESSIMISTIC_WRITE_LOCK_COUPON');
        expect(result1.saveCoupon.code).toBe('PESSIMISTIC_WRITE_LOCK_COUPON');
        expect(result1.saveCoupon.userId).toBe(user1.id);

        expect(result2.readCoupon).toBeNull();
        expect(result2.saveCoupon).toBeUndefined();
        expect(result2.error).toBe('No available coupon');
      } else {
        expect(result2.readCoupon.code).toBe('PESSIMISTIC_WRITE_LOCK_COUPON');
        expect(result2.saveCoupon.code).toBe('PESSIMISTIC_WRITE_LOCK_COUPON');
        expect(result2.saveCoupon.userId).toBe(user2.id);
        expect(result1.readCoupon).toBeNull();
        expect(result1.saveCoupon).toBeUndefined();
        expect(result1.error).toBe('No available coupon');
      }
    });

    it('should handle concurrent requests with pessimistic wite lock : no wait', async () => {
      const user1 = await userRepository.save({ name: 'user1' });
      const user2 = await userRepository.save({ name: 'user2' });
      await couponRepository.save({
        code: 'PESSIMISTIC_WRITE_LOCK_NO_WAIT_COUPON',
      });

      const result1Promise =
        couponService.assignCouponWithPessimisticWriteLockNoWait(user1.id);
      const result2Promise =
        couponService.assignCouponWithPessimisticWriteLockNoWait(user2.id);

      const [result1, result2] = await Promise.all([
        result1Promise,
        result2Promise,
      ]);

      // 쿠폰 읽기도 불가, 락이 걸린 데이터를 읽으려고 할 때 바로 에러
      if (result1.saveCoupon) {
        expect(result1.readCoupon.code).toBe(
          'PESSIMISTIC_WRITE_LOCK_NO_WAIT_COUPON',
        );
        expect(result1.saveCoupon.code).toBe(
          'PESSIMISTIC_WRITE_LOCK_NO_WAIT_COUPON',
        );
        expect(result1.saveCoupon.userId).toBe(user1.id);

        expect(result2.readCoupon).toBeUndefined();
        expect(result2.saveCoupon).toBeUndefined();
        expect(result2.error).toBe(
          'Statement aborted because lock(s) could not be acquired immediately and NOWAIT is set.',
        );
      } else {
        expect(result2.readCoupon.code).toBe(
          'PESSIMISTIC_WRITE_LOCK_NO_WAIT_COUPON',
        );
        expect(result2.saveCoupon.code).toBe(
          'PESSIMISTIC_WRITE_LOCK_NO_WAIT_COUPON',
        );
        expect(result2.saveCoupon.userId).toBe(user2.id);
        expect(result1.readCoupon).toBeUndefined();
        expect(result1.saveCoupon).toBeUndefined();
        expect(result1.error).toBe(
          'Statement aborted because lock(s) could not be acquired immediately and NOWAIT is set.',
        );
      }
    });
  });

  describe('Optimistic Lock', () => {
    it('should handle concurrent requests with optimistic lock', async () => {
      const user1 = await userRepository.save({ name: 'user1' });
      const user2 = await userRepository.save({ name: 'user2' });
      const coupon = await couponRepository.save({
        code: 'OPTIMISTIC_LOCK_COUPON',
      });
      const expectedVersion = coupon.version + 1;

      const result1Promise = couponService.assignCouponWithOptimisticLock(
        user1.id,
      );
      const result2Promise = couponService.assignCouponWithOptimisticLock(
        user2.id,
      );

      const [result1, result2] = await Promise.all([
        result1Promise,
        result2Promise,
      ]);

      if (result1.saveCoupon) {
        expect(result1.readCoupon.code).toBe('OPTIMISTIC_LOCK_COUPON');
        expect(result1.readCoupon.version).toBe(coupon.version);
        expect(result1.saveCoupon.code).toBe('OPTIMISTIC_LOCK_COUPON');
        expect(result1.saveCoupon.userId).toBe(user1.id);
        expect(result1.saveCoupon.version).toBe(expectedVersion);
        expect(result2.error).toBe(`Optimistic lock version mismatch`);
      } else {
        expect(result2.readCoupon.code).toBe('OPTIMISTIC_LOCK_COUPON');
        expect(result2.readCoupon.version).toBe(coupon.version);
        expect(result2.saveCoupon.code).toBe('OPTIMISTIC_LOCK_COUPON');
        expect(result2.saveCoupon.userId).toBe(user2.id);
        expect(result2.saveCoupon.version).toBe(expectedVersion);
        expect(result1.error).toBe(`Optimistic lock version mismatch`);
      }
    });
  });
});
