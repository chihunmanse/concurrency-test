import { Test, TestingModule } from '@nestjs/testing';
import { TypeOrmModule, getRepositoryToken } from '@nestjs/typeorm';
import { CouponService } from './coupon.service';
import { Coupon } from '../entity/coupon.entity';
import { User } from '../entity/user.entity';
import { DataSource, Repository } from 'typeorm';

describe('Isolation Level', () => {
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

  describe('Read Uncomitted', () => {
    it('should allow dirty read with READ UNCOMMITTED isolation level', async () => {
      await couponRepository.save({ code: 'COUPON_1' });

      const queryRunner1 = dataSource.createQueryRunner();
      await queryRunner1.connect();
      await queryRunner1.startTransaction('READ UNCOMMITTED');

      const queryRunner2 = dataSource.createQueryRunner();
      await queryRunner2.connect();
      await queryRunner2.startTransaction('READ UNCOMMITTED');

      try {
        // 트랜잭션 1이 쿠폰을 조회하고 변경
        const coupon1 = await queryRunner1.manager.findOne(Coupon, {
          where: { code: 'COUPON_1' },
        });
        if (coupon1) {
          coupon1.isRedeemed = true;
          await queryRunner1.manager.save(coupon1);
        }

        // 트랜잭션 2가 트랜잭션 1의 커밋 전에 동일한 쿠폰을 조회
        const coupon2 = await queryRunner2.manager.findOne(Coupon, {
          where: { code: 'COUPON_1' },
        });

        // 트랜잭션 1이 롤백됨
        await queryRunner1.rollbackTransaction();

        // 트랜잭션 1은 롤백되었지만 트랜잭션 2는 트랜잭션 1의 미커밋 상태의 수정된 데이터를 읽음
        expect(coupon2.isRedeemed).toBe(true);

        await queryRunner2.commitTransaction();
      } finally {
        await queryRunner1.release();
        await queryRunner2.release();
      }
    });

    it('should allow non-repeatable read with READ UNCOMMITTED isolation level', async () => {
      await couponRepository.save({
        code: 'COUPON_1',
      });

      const queryRunner1 = dataSource.createQueryRunner();
      await queryRunner1.connect();
      await queryRunner1.startTransaction('READ UNCOMMITTED');

      const queryRunner2 = dataSource.createQueryRunner();
      await queryRunner2.connect();
      await queryRunner2.startTransaction('READ UNCOMMITTED');

      try {
        // 트랜잭션 1이 쿠폰을 조회
        const coupon1Before = await queryRunner1.manager.findOne(Coupon, {
          where: { code: 'COUPON_1' },
        });

        // 트랜잭션 2가 동일한 쿠폰을 조회하고 수정
        const coupon2 = await queryRunner2.manager.findOne(Coupon, {
          where: { code: 'COUPON_1' },
        });

        if (coupon2) {
          coupon2.isRedeemed = true;
          await queryRunner2.manager.save(coupon2);
        }

        // 트랜잭션 2가 커밋됨
        await queryRunner2.commitTransaction();

        // 트랜잭션 1이 다시 쿠폰을 조회 (non-repeatable read 발생)
        const coupon1After = await queryRunner1.manager.findOne(Coupon, {
          where: { code: 'COUPON_1' },
        });

        expect(coupon1Before.isRedeemed).toBe(false); // 첫 번째 읽기 결과는 수정 전 상태
        expect(coupon1After.isRedeemed).toBe(true); // 두 번째 읽기 결과는 수정 후 상태

        await queryRunner1.commitTransaction();
      } finally {
        await queryRunner1.release();
        await queryRunner2.release();
      }
    });

    it('should allow phantom read with READ UNCOMMITTED isolation level', async () => {
      await couponRepository.save({ code: 'COUPON_1' });

      const queryRunner1 = dataSource.createQueryRunner();
      await queryRunner1.connect();
      await queryRunner1.startTransaction('READ UNCOMMITTED');

      const queryRunner2 = dataSource.createQueryRunner();
      await queryRunner2.connect();
      await queryRunner2.startTransaction('READ UNCOMMITTED');

      try {
        // 트랜잭션 1이 모든 쿠폰을 조회
        const couponsBefore = await queryRunner1.manager.find(Coupon, {
          where: { isRedeemed: false },
        });

        // 트랜잭션 2가 새로운 쿠폰을 추가
        await queryRunner2.manager.insert(Coupon, {
          code: 'COUPON_2',
        });
        await queryRunner2.commitTransaction();

        // 트랜잭션 1이 다시 모든 쿠폰을 조회 (phantom read 발생)
        const couponsAfter = await queryRunner1.manager.find(Coupon, {
          where: { isRedeemed: false },
        });
        console.log(couponsAfter);

        expect(couponsBefore.length).toBe(1);
        expect(couponsAfter.length).toBe(2);

        await queryRunner1.commitTransaction();
      } finally {
        await queryRunner2.release();
        await queryRunner1.release();
      }
    });
  });

  describe('Read Comitted', () => {
    it('should allow non repeatable read with READ COMMITTED isolation level', async () => {
      await couponRepository.save({
        code: 'COUPON_1',
      });

      const queryRunner1 = dataSource.createQueryRunner();
      await queryRunner1.connect();
      await queryRunner1.startTransaction('READ COMMITTED');

      const queryRunner2 = dataSource.createQueryRunner();
      await queryRunner2.connect();
      await queryRunner2.startTransaction('READ COMMITTED');

      try {
        // 트랜잭션 1이 쿠폰을 조회
        const coupon1Before = await queryRunner1.manager.findOne(Coupon, {
          where: { code: 'COUPON_1' },
        });

        // 트랜잭션 2가 동일한 쿠폰을 조회하고 수정
        const coupon2 = await queryRunner2.manager.findOne(Coupon, {
          where: { code: 'COUPON_1' },
        });

        if (coupon2) {
          coupon2.isRedeemed = true;
          await queryRunner2.manager.save(coupon2);
        }

        // 트랜잭션 2가 커밋됨
        await queryRunner2.commitTransaction();

        // 트랜잭션 1이 다시 쿠폰을 조회 (non-repeatable read 발생)
        const coupon1After = await queryRunner1.manager.findOne(Coupon, {
          where: { code: 'COUPON_1' },
        });

        expect(coupon1Before.isRedeemed).toBe(false); // 첫 번째 읽기 결과는 수정 전 상태
        expect(coupon1After.isRedeemed).toBe(true); // 두 번째 읽기 결과는 수정 후 상태

        await queryRunner1.commitTransaction();
      } finally {
        await queryRunner1.release();
        await queryRunner2.release();
      }
    });

    it('should allow phantom read with READ COMMITTED isolation level', async () => {
      await couponRepository.save({ code: 'COUPON_1' });

      const queryRunner1 = dataSource.createQueryRunner();
      await queryRunner1.connect();
      await queryRunner1.startTransaction('READ COMMITTED');

      const queryRunner2 = dataSource.createQueryRunner();
      await queryRunner2.connect();
      await queryRunner2.startTransaction('READ COMMITTED');

      try {
        // 트랜잭션 1이 모든 쿠폰을 조회
        const couponsBefore = await queryRunner1.manager.find(Coupon, {
          where: { isRedeemed: false },
        });

        // 트랜잭션 2가 새로운 쿠폰을 추가
        await queryRunner2.manager.insert(Coupon, {
          code: 'COUPON_2',
        });
        await queryRunner2.commitTransaction();

        // 트랜잭션 1이 다시 모든 쿠폰을 조회 (phantom read 발생)
        const couponsAfter = await queryRunner1.manager.find(Coupon, {
          where: { isRedeemed: false },
        });
        console.log(couponsAfter);

        expect(couponsBefore.length).toBe(1);
        expect(couponsAfter.length).toBe(2);

        await queryRunner1.commitTransaction();
      } finally {
        await queryRunner2.release();
        await queryRunner1.release();
      }
    });

    it('should prevent dirty read with READ COMMITTED isolation level', async () => {
      await couponRepository.save({ code: 'COUPON_1' });

      const queryRunner1 = dataSource.createQueryRunner();
      await queryRunner1.connect();
      await queryRunner1.startTransaction('READ COMMITTED');

      const queryRunner2 = dataSource.createQueryRunner();
      await queryRunner2.connect();
      await queryRunner2.startTransaction('READ COMMITTED');

      try {
        // 트랜잭션 1이 쿠폰을 조회하고 변경하지만 아직 커밋하지 않음
        const coupon1 = await queryRunner1.manager.findOne(Coupon, {
          where: { code: 'COUPON_1' },
        });

        if (coupon1) {
          coupon1.isRedeemed = true;
          await queryRunner1.manager.save(coupon1);
        }

        // 트랜잭션 2가 동일한 쿠폰을 조회, 트랜잭션 1의 변경사항이 보이지 않음 (Dirty Read가 발생하지 않음)
        const coupon2 = await queryRunner2.manager.findOne(Coupon, {
          where: { code: 'COUPON_1' },
        });
        expect(coupon2.isRedeemed).toBe(false); // 쿠폰이 변경되지 않은 상태여야 함

        await queryRunner1.rollbackTransaction();
        await queryRunner2.commitTransaction();
      } finally {
        await queryRunner1.release();
        await queryRunner2.release();
      }
    });
  });

  describe('Repeatable Read', () => {
    it('should prevent dirty read with REPEATABLE READ isolation level', async () => {
      await couponRepository.save({ code: 'COUPON_1' });

      const queryRunner1 = dataSource.createQueryRunner();
      await queryRunner1.connect();
      await queryRunner1.startTransaction('REPEATABLE READ');

      const queryRunner2 = dataSource.createQueryRunner();
      await queryRunner2.connect();
      await queryRunner2.startTransaction('REPEATABLE READ');

      try {
        // 트랜잭션 1이 쿠폰을 조회하고 변경하지만 아직 커밋하지 않음
        const coupon1 = await queryRunner1.manager.findOne(Coupon, {
          where: { code: 'COUPON_1' },
        });

        if (coupon1) {
          coupon1.isRedeemed = true;
          await queryRunner1.manager.save(coupon1);
        }

        // 트랜잭션 2가 동일한 쿠폰을 조회, 트랜잭션 1의 변경사항이 보이지 않음 (Dirty Read가 발생하지 않음)
        const coupon2 = await queryRunner2.manager.findOne(Coupon, {
          where: { code: 'COUPON_1' },
        });
        expect(coupon2.isRedeemed).toBe(false); // 쿠폰이 변경되지 않은 상태여야 함

        await queryRunner1.rollbackTransaction();
        await queryRunner2.commitTransaction();
      } finally {
        await queryRunner1.release();
        await queryRunner2.release();
      }
    });

    it('should prevent non-repeatable read with REPEATABLE READ isolation level', async () => {
      await couponRepository.save({ code: 'COUPON_1' });

      const queryRunner1 = dataSource.createQueryRunner();
      await queryRunner1.connect();
      await queryRunner1.startTransaction('REPEATABLE READ');

      const queryRunner2 = dataSource.createQueryRunner();
      await queryRunner2.connect();
      await queryRunner2.startTransaction('REPEATABLE READ');

      try {
        // 트랜잭션 1이 쿠폰을 조회
        const coupon1Before = await queryRunner1.manager.findOne(Coupon, {
          where: { code: 'COUPON_1' },
        });

        // 트랜잭션 2가 동일한 쿠폰을 조회하고 수정
        const coupon2 = await queryRunner2.manager.findOne(Coupon, {
          where: { code: 'COUPON_1' },
        });

        if (coupon2) {
          coupon2.isRedeemed = true;
          await queryRunner2.manager.save(coupon2);
        }

        // 트랜잭션 2가 커밋됨
        await queryRunner2.commitTransaction();

        // 트랜잭션 1이 다시 쿠폰을 조회 (Non-repeatable Read 발생하지 않음)
        const coupon1After = await queryRunner1.manager.findOne(Coupon, {
          where: { code: 'COUPON_1' },
        });

        // 처음 조회한 상태와 동일해야 함
        expect(coupon1Before.isRedeemed).toBe(coupon1After.isRedeemed);

        await queryRunner1.rollbackTransaction();
      } finally {
        await queryRunner2.release();
        await queryRunner1.release();
      }
    });

    // SQL 표준에서는 REPEATABLE READ 수준에서 phantom read가 발생하지만, MySQL의 REPEATABLE READ 수준에서는 발생하지 않음
    it('should prevent phantom read with REPEATABLE READ isolation level', async () => {
      await couponRepository.save({ code: 'COUPON_1' });

      const queryRunner1 = dataSource.createQueryRunner();
      await queryRunner1.connect();
      await queryRunner1.startTransaction('REPEATABLE READ');

      const queryRunner2 = dataSource.createQueryRunner();
      await queryRunner2.connect();
      await queryRunner2.startTransaction('REPEATABLE READ');

      try {
        // 트랜잭션 1이 모든 쿠폰을 조회
        const couponsBefore = await queryRunner1.manager.find(Coupon, {
          where: { isRedeemed: false },
        });

        // 트랜잭션 2가 새로운 쿠폰을 추가
        await queryRunner2.manager.insert(Coupon, {
          code: 'COUPON_2',
        });
        await queryRunner2.commitTransaction();

        // 트랜잭션 1이 다시 모든 쿠폰을 조회 (phantom read 발생하지 않음)
        const couponsAfter = await queryRunner1.manager.find(Coupon, {
          where: { isRedeemed: false },
        });

        expect(couponsBefore.length).toBe(couponsAfter.length);

        await queryRunner1.commitTransaction();
      } finally {
        await queryRunner2.release();
        await queryRunner1.release();
      }
    });
  });
});
