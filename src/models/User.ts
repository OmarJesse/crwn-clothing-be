import { Model, DataTypes } from "sequelize";
import sequelize from "./sequelize";

class User extends Model {
  public id!: string;
  public name!: string;
  public email!: string;
  public password!: string;
  public role!: "admin" | "user";
  public heightCm!: number | null;
  public weightKg!: number | null;
  public bmi!: number | null;
  public chestCm!: number | null;
  public waistCm!: number | null;
  public hipCm!: number | null;
  public inseamCm!: number | null;
  public shoulderCm!: number | null;
  public preferredFit!: string | null;
  public bodyShape!: string | null;
  public onboardingCompletedAt!: Date | null;
  public recommendationVersion!: string | null;
  public landmarkSummary!: Record<string, unknown> | null;
  public landmarkModel!: string | null;
  public preferredStyles!: string[] | null;
  public preferredPalettes!: string[] | null;
}

User.init(
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: sequelize.literal("uuid_generate_v4()"),
      primaryKey: true,
      allowNull: false,
      unique: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    role: {
      type: DataTypes.ENUM("admin", "user"),
      allowNull: false,
      defaultValue: "user",
    },
    heightCm: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    weightKg: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    bmi: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    chestCm: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    waistCm: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    hipCm: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    inseamCm: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    shoulderCm: {
      type: DataTypes.FLOAT,
      allowNull: true,
    },
    preferredFit: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    bodyShape: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    onboardingCompletedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    recommendationVersion: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    landmarkSummary: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    },
    landmarkModel: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    preferredStyles: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    },
    preferredPalettes: {
      type: DataTypes.JSONB,
      allowNull: true,
      defaultValue: null,
    },
  },
  {
    sequelize,
    tableName: "users",
  }
);

export default User;
