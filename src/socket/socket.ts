// import { Server } from 'socket.io';
// import geoip from 'geoip-lite';
// import logger from '../utils/logger';

// interface ActiveUser {
//   socketId: string;
//   ip: string;
//   country: string;
//   connectedAt: Date;
//   path?: string;
// }

// export class SocketController {
//   private activeUsers: Map<string, ActiveUser>;
//   private io: Server;

//   constructor(io: Server) {
//     this.activeUsers = new Map();
//     this.io = io;
//     this.initializeSocket();
//   }

//   private initializeSocket() {
//     this.io.on('connection', (socket) => {
//       // Get IP address (works differently in production)
//       const ip = socket.handshake.headers['x-forwarded-for']?.toString().split(',')[0] || 
//                  socket.handshake.address;

//       // Get country from IP
//       const geo = geoip.lookup(ip);
//       const country = geo?.country || 'Unknown';

//       // Add user to active users
//       this.activeUsers.set(socket.id, {
//         socketId: socket.id,
//         ip,
//         country,
//         connectedAt: new Date(),
//         path: socket.handshake.headers.referer
//       });

//       logger.info(`New connection from ${country} (IP: ${ip})`);

//       // Notify all clients about new connection
//       this.io.emit('user_connected', {
//         id: socket.id,
//         country,
//         timestamp: new Date()
//       });

//       // Send current active users to the new connection
//       socket.emit('active_users', this.getActiveUsers());
//       socket.emit('user_statistics', this.getStatistics());

//       // Handle page view updates
//       socket.on('page_view', (path: string) => {
//         const user = this.activeUsers.get(socket.id);
//         if (user) {
//           user.path = path;
//           this.io.emit('user_statistics', this.getStatistics());
//         }
//       });

//       // Handle disconnection
//       socket.on('disconnect', () => {
//         const user = this.activeUsers.get(socket.id);
//         if (user) {
//           this.activeUsers.delete(socket.id);
//           this.io.emit('user_disconnected', {
//             id: socket.id,
//             country: user.country,
//             timestamp: new Date()
//           });
//           this.io.emit('user_statistics', this.getStatistics());
//           logger.info(`User from ${user.country} disconnected`);
//         }
//       });
//     });
//   }

//   public getActiveUsers(): ActiveUser[] {
//     return Array.from(this.activeUsers.values());
//   }

//   public getStatistics() {
//     const countries: Record<string, number> = {};
//     const pages: Record<string, number> = {};
//     let totalUsers = 0;

//     this.activeUsers.forEach(user => {
//       totalUsers++;
//       countries[user.country] = (countries[user.country] || 0) + 1;
//       if (user.path) {
//         pages[user.path] = (pages[user.path] || 0) + 1;
//       }
//     });

//     return {
//       totalUsers,
//       countries,
//       pages,
//       countryCount: Object.keys(countries).length,
//       uniqueIps: new Set(Array.from(this.activeUsers.values()).map(u => u.ip)).size
//     };
//   }
// }

// socket.ts (server)
import { Server } from 'socket.io';
import geoip from 'geoip-lite';
import logger from '../utils/logger';

interface ActiveUser {
  userId: string; // Add this field
  socketId: string;
  ip: string;
  country: string;
  connectedAt: Date;
  path?: string;
}

export class SocketController {
  private activeUsers: Map<string, ActiveUser>;
  private userSockets: Map<string, string[]>; // Track sockets by user ID
  private io: Server;

  constructor(io: Server) {
    this.activeUsers = new Map();
    this.userSockets = new Map();
    this.io = io;
    this.initializeSocket();
  }

  private initializeSocket() {
    this.io.on('connection', (socket) => {
      // Get user ID from client handshake
      const userId = socket.handshake.auth.userId;
      
      // Get IP address
      const ip = socket.handshake.headers['x-forwarded-for']?.toString().split(',')[0] || 
                 socket.handshake.address;

      // Get country from IP
      const geo = geoip.lookup(ip);
      const country = geo?.country || 'Unknown';

      // Track user's sockets
      if (!this.userSockets.has(userId)) {
        this.userSockets.set(userId, []);
      }
      this.userSockets.get(userId)!.push(socket.id);

      // Add/update user in active users (only if first connection for this user)
      if (!this.activeUsers.has(userId)) {
        this.activeUsers.set(userId, {
          userId,
          socketId: socket.id,
          ip,
          country,
          connectedAt: new Date(),
          path: socket.handshake.headers.referer
        });

        logger.info(`New user connection from ${country} (IP: ${ip})`);

        // Notify all clients about new user connection
        this.io.emit('user_connected', {
          id: userId,
          country,
          timestamp: new Date()
        });
      }

      // Send current active users to the new connection
      socket.emit('active_users', this.getActiveUsers());
      socket.emit('user_statistics', this.getStatistics());

      // Handle page view updates
      socket.on('page_view', (path: string) => {
        const user = this.activeUsers.get(userId);
        if (user) {
          user.path = path;
          this.io.emit('user_statistics', this.getStatistics());
        }
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        // Remove socket from user's socket list
        const userSockets = this.userSockets.get(userId);
        if (userSockets) {
          const index = userSockets.indexOf(socket.id);
          if (index > -1) {
            userSockets.splice(index, 1);
          }
          
          // If user has no more sockets, remove from active users
          if (userSockets.length === 0) {
            const user = this.activeUsers.get(userId);
            if (user) {
              this.activeUsers.delete(userId);
              this.userSockets.delete(userId);
              
              this.io.emit('user_disconnected', {
                id: userId,
                country: user.country,
                timestamp: new Date()
              });
              this.io.emit('user_statistics', this.getStatistics());
              logger.info(`User from ${user.country} disconnected`);
            }
          }
        }
      });
    });
  }

  // Rest of the methods remain similar but use userId instead of socketId
  public getActiveUsers(): ActiveUser[] {
    return Array.from(this.activeUsers.values());
  }

  public getStatistics() {
    const countries: Record<string, number> = {};
    const pages: Record<string, number> = {};
    let totalUsers = this.activeUsers.size;

    this.activeUsers.forEach(user => {
      countries[user.country] = (countries[user.country] || 0) + 1;
      if (user.path) {
        pages[user.path] = (pages[user.path] || 0) + 1;
      }
    });

    return {
      totalUsers,
      countries,
      pages,
      countryCount: Object.keys(countries).length,
      uniqueIps: new Set(Array.from(this.activeUsers.values()).map(u => u.ip)).size
    };
  }
}