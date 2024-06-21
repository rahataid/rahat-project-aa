import { Injectable } from "@nestjs/common";
import { PrismaService } from "@rumsan/prisma";
import { StatsService } from "../stats";

@Injectable()
export class BeneficiaryStatService {
    constructor(
        protected prisma: PrismaService,
        private readonly statsService: StatsService
    ) { }

    async totalBeneficiaries() {
        return { count: await this.prisma.beneficiary.count() };
    }

    async calculateGenderStats() {
        const genderStats = await this.prisma.beneficiary.groupBy({
            by: ['gender'],
            _count: {
                gender: true,
            }
        });

        return genderStats.map((stat) => ({
            id: stat.gender,
            count: stat._count.gender,
        }));
    }

    async calculateVulnerabilityStats() {
        const vulnerabilityCounts = await Promise.all([
            this.prisma.beneficiary.count({
                where: {
                    extras: {
                        path: ['isVulnerable'],
                        equals: 'Yes'
                    }
                }
            }),
            this.prisma.beneficiary.count({
                where: {
                    extras: {
                        path: ['isVulnerable'],
                        equals: 'No'
                    }
                }
            }),
        ]);

        return [
            { id: 'Vulnerable', count: vulnerabilityCounts[0] },
            { id: 'Not_Vulnerable', count: vulnerabilityCounts[1] },
        ];
    }

    async calculateBankStatusStats() {
        const bankStatusCounts = await Promise.all([
            this.prisma.beneficiary.count({
                where: {
                    extras: {
                        path: ['is_there_any_family_member_who_has_an_active_bank_account'],
                        equals: 'Yes'
                    }
                }
            }),
            this.prisma.beneficiary.count({
                where: {
                    extras: {
                        path: ['is_there_any_family_member_who_has_an_active_bank_account'],
                        equals: 'No'
                    }
                }
            }),
        ]);

        return [
            { id: 'Banked', count: bankStatusCounts[0] },
            { id: 'Unbanked', count: bankStatusCounts[1] },
        ];
    }

    async calculatePhoneSetTypeStats() {
        const phoneSetTypeCounts = await Promise.all([
            this.prisma.beneficiary.count({
                where: {
                    extras: {
                        path: ['type_of_phone_set'],
                        equals: 'Smart Phone Set'
                    }
                }
            }),
            this.prisma.beneficiary.count({
                where: {
                    extras: {
                        path: ['type_of_phone_set'],
                        equals: 'Simple Mobile Set'
                    }
                }
            }),
        ]);

        return [
            { id: 'Smart_Phone_Set', count: phoneSetTypeCounts[0] },
            { id: 'Simple_Mobile_Set', count: phoneSetTypeCounts[1] },
        ];
    }

    countByBank(array) {
        return array.reduce((result, currentValue) => {
            const bankValue = currentValue.extras.bank_name;
            if (bankValue) {
                if (!result[bankValue]) {
                    result[bankValue] = 0;
                }
                result[bankValue]++;
            }
            return result;
        }, {});
    }

    async calculateCountByBankStats() {
        const results = await this.prisma.beneficiary.findMany({
            where: {
                extras: {
                    path: ['bank_name'],
                    // ensure bank value exists
                    not: null || ''
                }
            },
            select: {
                uuid: true,
                extras: true
            }
        });

        const bankCounts = this.countByBank(results);
        const resultArray = Object.keys(bankCounts).map(key => {
            return {
                id: key,
                count: bankCounts[key]
            };
        });
        return resultArray;
    }

    filterAndCountPhoneStatus(data) {
        let unPhonedCount = 0;
        let phonedCount = 0;

        data.forEach(record => {
            const phoneNumber = record.extras.phone;
            if (phoneNumber.startsWith('999')) {
                unPhonedCount += 1;
            } else {
                phonedCount += 1;
            }
        });

        return [
            { id: "Phoned", count: phonedCount },
            { id: "UnPhoned", count: unPhonedCount },
        ];
    }

    async calculatePhoneStatusStats() {
        const results = await this.prisma.beneficiary.findMany({
            where: {
                extras: {
                    path: ['phone'],
                    // ensure phone exists
                    not: null || ''
                }
            },
            select: {
                uuid: true,
                extras: true
            }
        });
        const finalResult = this.filterAndCountPhoneStatus(results)
        return finalResult
    }

    async calculateAllStats() {
        const [total, gender, vulnerabilityStatus, bankStatus, phoneType, countByBank, phoneStatus] = await Promise.all([
            this.totalBeneficiaries(),
            this.calculateGenderStats(),
            this.calculateVulnerabilityStats(),
            this.calculateBankStatusStats(),
            this.calculatePhoneSetTypeStats(),
            this.calculateCountByBankStats(),
            this.calculatePhoneStatusStats()
        ])
        return {
            total,
            gender,
            vulnerabilityStatus,
            bankStatus,
            phoneType,
            countByBank,
            phoneStatus
        }
    }

    async saveAllStats() {
        const { total, gender, vulnerabilityStatus, bankStatus, phoneType, countByBank, phoneStatus } =
            await this.calculateAllStats();

        await Promise.all([
            this.statsService.save({
                name: 'beneficiary_total',
                data: total,
                group: 'beneficiary',
            }),
            this.statsService.save({
                name: 'beneficiary_gender',
                data: gender,
                group: 'beneficiary'
            }),
            this.statsService.save({
                name: 'beneficiary_vulnerabilityStatus',
                data: vulnerabilityStatus,
                group: 'beneficiary'
            }),
            this.statsService.save({
                name: 'beneficiary_bankStatus',
                data: bankStatus,
                group: 'beneficiary'
            }),
            this.statsService.save({
                name: 'beneficiary_phoneType',
                data: phoneType,
                group: 'beneficiary'
            }),
            this.statsService.save({
                name: 'beneficiary_countByBank',
                data: countByBank,
                group: 'beneficiary'
            }),
            this.statsService.save({
                name: 'beneficiary_phoneStatus',
                data: phoneStatus,
                group: 'beneficiary'
            }),
        ])

        return { total, gender, vulnerabilityStatus, bankStatus, phoneType, countByBank, phoneStatus }
    }
}