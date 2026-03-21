import { NextRequest, NextResponse } from 'next/server';
import { connectMongo } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/requireAdmin';
import { hashPassword } from '@/lib/auth';
import { UserModel } from '@/models/User';

export async function GET(req: NextRequest) {
  try {
    requireAdmin(req);
    await connectMongo();

    const users = await UserModel.find({})
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json({
      success: true,
      users: users.map((user) => ({
        id: String(user._id),
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';

    return NextResponse.json(
      {
        success: false,
        error:
          message === 'Forbidden'
            ? 'Forbidden'
            : message === 'Unauthorized'
            ? 'Unauthorized'
            : 'Failed to fetch users',
      },
      {
        status:
          message === 'Forbidden'
            ? 403
            : message === 'Unauthorized'
            ? 401
            : 500,
      }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    requireAdmin(req);
    await connectMongo();

    const body = await req.json();
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const name = String(body.name || '').trim();
    const role = body.role === 'admin' ? 'admin' : 'user';

    if (!email || !password) {
      return NextResponse.json(
        { success: false, error: 'Email and password are required' },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { success: false, error: 'Password must be at least 6 characters' },
        { status: 400 }
      );
    }

    const exists = await UserModel.findOne({ email }).lean();
    if (exists) {
      return NextResponse.json(
        { success: false, error: 'Email already exists' },
        { status: 409 }
      );
    }

    const passwordHash = await hashPassword(password);

    const user = await UserModel.create({
      email,
      passwordHash,
      name,
      role,
      status: 'active',
    });

    return NextResponse.json({
      success: true,
      user: {
        id: String(user._id),
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Request failed';

    return NextResponse.json(
      {
        success: false,
        error:
          message === 'Forbidden'
            ? 'Forbidden'
            : message === 'Unauthorized'
            ? 'Unauthorized'
            : 'Failed to create user',
      },
      {
        status:
          message === 'Forbidden'
            ? 403
            : message === 'Unauthorized'
            ? 401
            : 500,
      }
    );
  }
}
