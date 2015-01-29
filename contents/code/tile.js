/********************************************************************
 KWin - the KDE window manager
 This file is part of the KDE project.

Copyright (C) 2012 Mathias Gottschlag <mgottschlag@gmail.com>
Copyright (C) 2013-2014 Fabian Homborg <FHomborg@gmail.com>

This program is free software; you can redistribute it and/or modify
it under the terms of the GNU General Public License as published by
the Free Software Foundation; either version 2 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
GNU General Public License for more details.

You should have received a copy of the GNU General Public License
along with this program.  If not, see <http://www.gnu.org/licenses/>.
*********************************************************************/

/**
 * Class which manages the windows in one tile and handles resize/move and
 * property change events.
 * @class
 */
function Tile(firstClient, tileIndex) {
	try {
		/**
		 * Signal which is triggered whenever the user starts to move the tile.
		 */
		this.movingStarted = new Signal();
		/**
		 * Signal which is triggered whenever the user stops moving the tile.
		 */
		this.movingEnded = new Signal();
		/**
		 * Signal which is triggered whenever the geometry changes between
		 * movingStarted and movingEnded.
		 */
		this.movingStep = new Signal();
		/**
		 * Signal which is triggered whenever the user starts to resize the tile.
		 */
		this.resizingStarted = new Signal();
		/**
		 * Signal which is triggered whenever the user stops resizing the tile.
		 */
		this.resizingEnded = new Signal();
		/**
		 * Signal which is triggered whenever the geometry changes between
		 * resizingStarted and resizingEnded.
		 */
		this.resizingStep = new Signal();
		/**
		 * Signal which is triggered whenever the tile is moved to a different
		 * screen. Two parameters are passed to the handlers, the old and the new
		 * screen.
		 */
		this.screenChanged = new Signal();
		/**
		 * Signal which is triggered whenever the tile is moved to a different
		 * desktop. Two parameters are passed to the handlers, the old and the new
		 * desktop.
		 */
		this.desktopChanged = new Signal();
		/**
		 * List of the clients in this tile.
		 */
		this.clients = [];
		this.originalx = util.middlex(firstClient.geometry);
		this.originaly = util.middley(firstClient.geometry);
		/**
		 * Index of this tile in the TileList to which the tile belongs.
		 */
		this.tileIndex = tileIndex;
		/**
		 * True if this tile is currently moved by the user.
		 */
		this._moving = false;
		/**
		 * True if this tile is currently moved by the user.
		 */
		this._resizing = false;
		/**
		 * Stores the current screen of the tile in order to be able to detect
		 * movement between screens.
		 */
		this._currentScreen = firstClient.screen;

		/**
		 * Stores the current desktop as this is needed as a desktopChanged
		 * parameter.
		 */
		if (firstClient.onAllDesktops == true) {
			this._currentDesktop = -1;
		} else {
			this._currentDesktop = firstClient.desktop;
		}

		this.rectangle = null;

		this.syncCustomProperties();

		this.respectMinMax = KWin.readConfig("respectMinMax", true);

		var gapSize = KWin.readConfig("gapSize", 0);  /* stick to old gaps config by default */
		this.windowsGapSizeHeight = KWin.readConfig("windowsGapSizeHeight", gapSize);
		this.windowsGapSizeWidth = KWin.readConfig("windowsGapSizeWidth", gapSize);
		this.screenGapSizeLeft = KWin.readConfig("screenGapSizeLeft", 0);
		this.screenGapSizeRight = KWin.readConfig("screenGapSizeRight", 0);
		this.screenGapSizeTop = KWin.readConfig("screenGapSizeTop", 0);
		this.screenGapSizeBottom = KWin.readConfig("screenGapSizeBottom", 0);
		this.addClient(firstClient);
	} catch(err) {
		print(err, "in Tile");
	}
};

/**
 * Sets the geometry of the tile. geometryChanged events caused by this function
 * are suppressed.
 *
 * @param geometry New tile geometry.
 */
Tile.prototype.setGeometry = function(geometry) {
	try {
		if (geometry == null) {
			return;
		}
		if (this.maximize == true) {
			this.oldRect = util.copyRect(geometry);
			return;
		}
		if (this.rectangle == null) {
			this.rectangle = util.copyRect(geometry);
		} else {
			util.setRect(this.rectangle, geometry);
		}
		for (var i = 0; i < this.clients.length; i++) {
			this.clients[i].tiling_MoveResize = false;
			this.onClientGeometryChanged(this.clients[i]);
		}
	} catch(err) {
		print(err, "in Tile.setGeometry");
	}
};

Tile.prototype.resetGeometry = function() {
	this.setGeometry(this.rectangle);
};

/**
 * Returns the currently active client in the tile.
 */
Tile.prototype.getActiveClient = function() {
	try {
		var active = null;
		this.clients.forEach(function(client) {
			if (client.isCurrentTab) {
				active = client;
			}
		});
		return active;
	} catch(err) {
		print(err, "in Tile.getActiveClient");
	}
};

/**
 * Synchronizes all custom properties (tileIndex, floating between all clients
 * in the tile).
 */
Tile.prototype.syncCustomProperties = function() {
	try {
		var client = this.getActiveClient();
		if (client == null) {
			client = this.clients[0];
		}
		if (client != null) {
			client.tiling_tileIndex = this.tileIndex;
			client.syncTabGroupFor("tiling_tileIndex", true);
			client.syncTabGroupFor("tiling_floating", true);
		}
	} catch(err) {
		print(err, "in Tile.syncCustomProperties");
	}
};

Tile.prototype.onClientGeometryChanged = function(client) {
		this.setClientGeometry(client);
};

Tile.prototype.setAllClientGeometries = function() {
	var self = this;
	this.clients.forEach(function(client) {
		self.setClientGeometry(client);
	});
};

Tile.prototype.setClientGeometry = function(client) {
	try {
		if (client == null) {
			return;
		}
		if (this.hasClient(client) == false) {
			print("Wrong tile called");
			return;
		}
		// Don't resize when we aren't the current desktop
		// or on all desktops
		if (this._currentDesktop != workspace.currentDesktop
			&& this._currentDesktop != -1) {
			return;
		}
		// These two should never be reached
		if (client.deleted == true) {
			return;
		}
		if (client.managed == false) {
			return;
		}
		if (!client.isCurrentTab) {
			return;
		}
		if (client.move || client.resize) {
			return;
		}
		if (this._moving || this._resizing) {
			return;
		}
		if (client.resizeable != true) {
			return;
		}
		if (client.moveable != true) {
			return;
		}
		// Nothing to be done here - this just doesn't make sense
		if (client.minSize.width == client.maxSize.width && client.minSize.height == client.maxSize.width) {
			return;
		}
		if (this.rectangle != null) {
			if (util.compareRect(this.rectangle, client.geometry) == false) {
				client.tiling_resize = true;
				// Respect min/maxSize
				var changedRect = false;
				var screenRect = util.getTilingArea(this._currentScreen, this._currentDesktop);
				// This can theoretically result in an endless loop
				// e.g. when the only client has a maxsize smaller than the clientarea
				if (this.respectMinMax) {
					if (client.minSize.width > this.rectangle.width) {
						if (this.rectangle.x + this.rectangle.width == screenRect.x + screenRect.width - this.screenGapSizeRight) {
							this.rectangle.x = (screenRect.x + screenRect.width - this.screenGapSizeRight) - client.minSize.width;
						}
						this.rectangle.width = client.minSize.width + this.windowsGapSizeWidth;
						changedRect = true;
					}
					if (client.minSize.height > this.rectangle.height) {
						if (this.rectangle.y + this.rectangle.height == screenRect.y + screenRect.height - this.screenGapSizeBottom) {
							this.rectangle.y = (screenRect.y + screenRect.height - this.screenGapSizeBottom) - client.minSize.height;
						}
						this.rectangle.height = client.minSize.height + this.windowsGapSizeHeight;
						changedRect = true;
					}
					if (client.maxSize.width < this.rectangle.width && client.maxSize.width > 0) {
						if (this.rectangle.x + this.rectangle.width == screenRect.x + screenRect.width - this.screenGapSizeRight) {
							this.rectangle.x = (screenRect.x + screenRect.width - this.screenGapSizeRight) - client.maxSize.width;
						}
						this.rectangle.width = client.maxSize.width + this.windowsGapSizeWidth;
						changedRect = true;
					}
					if (client.maxSize.height < this.rectangle.height && client.maxSize.height > 0) {
						if (this.rectangle.y + this.rectangle.height == screenRect.y + screenRect.height - this.screenGapSizeBottom) {
							this.rectangle.y = (screenRect.y + screenRect.height - this.screenGapSizeBottom) - client.maxSize.height;
						}
						this.rectangle.height = client.maxSize.height + this.windowsGapSizeHeight;
						changedRect = true;
					}
				}
				// Don't accidentally maximize windows
				var eBM = options.electricBorderMaximize;
				options.electricBorderMaximize = false;
				client.geometry = util.copyRect(this.rectangle);
				options.electricBorderMaximize = eBM;

				if (changedRect == true) {
					this._resizing = true;
					this.resizingEnded.emit();
					this._resizing = false;
				}

				client.tiling_resize = false;
			}
		} else {
			print("No rectangle", client.resourceClass.toString(), client.windowId);
		}
	} catch(err) {
		print(err, "in Tile.onClientGeometryChanged");
	}
};

Tile.prototype.onClientDesktopChanged = function(client) {
	try {
		if (!client.isCurrentTab) {
			return;
		}
		var oldDesktop = this._currentDesktop;
		// KWin 5.2 at least will hand us a number larger than
		// the last desktop to indicate it used to be on all desktops
		// Check onAllDesktops instead
		if (client.onAllDesktops == true) {
			this._currentDesktop = -1;
		} else {
			this._currentDesktop = client.desktop;
		}
		this.desktopChanged.emit(oldDesktop, this._currentDesktop);
	} catch(err) {
		print(err, "in Tile.onClientDesktopChanged");
	}
};

Tile.prototype.onClientStartUserMovedResized = function(client) {
	// Let client stay above the other tilers so the user sees the move
	client.keepBelow = false;
};

Tile.prototype.onClientStepUserMovedResized = function(client) {
	try {
		if (client.resize) {
			this._resizing = true;
			this.resizingStep.emit();
			// This means it gets animated
			this.resizingEnded.emit();
			return;
		}
		if (client.move) {
			this._moving = true;
			this.movingStep.emit();
			this.movingEnded.emit();
			return;
		}
	} catch(err) {
		print(err, "in Tile.onClientStepUserMovedResized");
	}
};

Tile.prototype.onClientFinishUserMovedResized = function(client) {
	try {
		if (this._moving) {
			this._moving = false;
			this.movingEnded.emit();
		} else if (this._resizing) {
			this._resizing = false;
			this.resizingEnded.emit();
		}
		// Put the client on the same layer as the other tilers again
		client.keepBelow = true;
	} catch(err) {
		print(err, "in Tile.onClientFinishUserMovedResized");
	}
};

Tile.prototype.removeClient = function(client) {
	try {
		this.clients.splice(this.clients.indexOf(client), 1);
	} catch(err) {
		print(err, "in Tile.removeClient");
	}
};

Tile.prototype.addClient = function(client) {
	try {
		if (this.clients.indexOf(client) == -1) {
			client.keepBelow = true;
			if (KWin.readConfig("noBorder", false) == true) {
				client.noBorder = true;
			}
			this.clients.push(client);
			this.syncCustomProperties();
			this.onClientGeometryChanged(client);
		}
	} catch(err) {
		print(err, "in Tile.addClient");
	}
};

Tile.prototype.onClientMaximizedStateChanged = function(client, h, v) {
	try {
		// Reset this so setGeometry does its thing
		this.maximize = false;
		var screenRect = workspace.clientArea(KWin.PlacementArea, this._currentScreen, this._currentDesktop);
		if (this.rectangle != null) {
			var newRect = util.copyRect(this.rectangle);
		} else {
			var newRect = util.copyRect(screenRect);
		}
		// FIXME: If h was never true, maximizing and then unmaximizing v restores x/width to previous values
		// Instead, we should save h _and_ v
		if (h == true) {
			newRect.x = screenRect.x;
			newRect.width = screenRect.width;
		} else {
			if (this.oldRect != null) {
				newRect.x = this.oldRect.x;
				newRect.width = this.oldRect.width;
			}
		}
		if (v == true) {
			newRect.y = screenRect.y;
			newRect.height = screenRect.height;
		} else {
			if (this.oldRect != null) {
				newRect.y = this.oldRect.y;
				newRect.height = this.oldRect.height;
			}
		}
		this.oldRect = util.copyRect(this.rectangle);
		this.setGeometry(newRect);
		// Set keepBelow to keep maximized clients over tiled ones
		if (h == true || v == true) {
			client.keepBelow = false;
			this.maximize = true;
		} else {
			client.keepBelow = true;
		}
	} catch(err) {
		print(err, "in tile.onClientMaximizedStateChanged");
	}
};

Tile.prototype.hasClient = function(client) {
	return (this.clients.indexOf(client) > -1);
};

