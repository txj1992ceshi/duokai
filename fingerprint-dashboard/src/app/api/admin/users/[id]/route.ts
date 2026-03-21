import { NextRequest, NextResponse } from 'next/server';
import { connectMongo } from '@/lib/mongodb';
import { requireAdmin } from '@/lib/requireAdmin';
import { UserModel } from '@/models/User';

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    requireAdmin(req);
    await connectMongo();

    const { id } = await context.params;
    const body = await req.json();

    const updateData: Record<string, unknown> = {};

    if (typeof body.name === 'string') {
      updateData.name = body.name.trim();
    }

    if (body.role === 'user' || body.role === 'admin') {
      updateData.role = body.role;
    }

    if (body.status === 'active' || body.status === 'disabled') {
      updateData.status = body.status;
    }

    const user = await UserModel.findByIdAndUpdate(id, updateData, {
      new: true,
    }).lean();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

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
            : 'Failed to update user',
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

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    requireAdmin(req);
    await connectMongo();

    const { id } = await context.params;

    const user = await UserModel.findByIdAndUpdate(
      id,
      { status: 'disabled' },
      { new: true }
    ).lean();

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'User disabled successfully',
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
            : 'Failed to disable user',
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
